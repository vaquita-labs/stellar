import { Account, Address, Contract, Keypair, Networks, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { prisma } from '@vaquita/db';
import { NextResponse, type NextRequest } from 'next/server';
import { formatUnits, rpcUrlFor } from '@/lib/contractEvents';
import { adminSecretOk } from '@/lib/adminSecret';

// On-chain snapshot of a token's Vaquita pool: how much the pool controls
// (DeFindex vault shares + idle token balance), the per-period totals from the
// pool's instance storage, and every live position grouped by owner address.
//
// Positions live in persistent storage keyed by deposit_id = sha256(caller ||
// nonce), which is NOT enumerable on-chain. We rebuild the keys from the
// deposit_id_hex values the listener recorded in the deposits table, then read
// them in bulk via getLedgerEntries — so the per-address breakdown is on-chain
// truth for every deposit the DB knows about. `coverage` reports whether the
// DB-known live positions account for the pool's own PositionCount counter.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
const badRequest = (message: string) => NextResponse.json({ status: 'error', message }, { status: 400 });

// getLedgerEntries accepts at most 200 keys per request.
const LEDGER_KEYS_PER_REQUEST = 200;

const toStringSafe = (v: unknown): string => (typeof v === 'bigint' ? v.toString() : String(v ?? ''));

/** Simulate a read-only contract call and return the decoded return value. */
async function simulateCall(
  server: rpc.Server,
  networkPassphrase: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<unknown> {
  const contract = new Contract(contractId);
  const account = new Account(Keypair.random().publicKey(), '0');
  const transaction = new TransactionBuilder(account, { fee: '100', networkPassphrase })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const simulation = await server.simulateTransaction(transaction);
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(`${method} simulation failed: ${simulation.error}`);
  }
  const retval = simulation.result?.retval;
  return retval ? scValToNative(retval) : null;
}

/** Ledger key for the pool's contract-instance entry (admin config + period maps). */
const instanceLedgerKey = (pool: string): xdr.LedgerKey =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(pool).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );

/** Ledger key for a persistent Positions(deposit_id) entry. */
const positionLedgerKey = (pool: string, depositIdHex: string): xdr.LedgerKey =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(pool).toScAddress(),
      key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Positions'), xdr.ScVal.scvBytes(Buffer.from(depositIdHex, 'hex'))]),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );

interface PeriodRow {
  periodSeconds: number;
  totalDeposits: string;
  rewardPool: string;
  /** Live position count for this period (PositionCountForPeriod). */
  positionsCount: number | null;
}

interface InstanceState {
  paused: boolean | null;
  positionCount: number | null;
  protocolFees: string | null;
  earlyWithdrawalFeeBps: string | null;
  blendToken: string | null;
  vaultAddress: string | null;
  periods: PeriodRow[];
}

/** Decode the pool's instance-storage map into the fields the admin cares about. */
function decodeInstanceStorage(entry: xdr.LedgerEntryData | undefined): InstanceState {
  const state: InstanceState = {
    paused: null,
    positionCount: null,
    protocolFees: null,
    earlyWithdrawalFeeBps: null,
    blendToken: null,
    vaultAddress: null,
    periods: [],
  };
  const storage = entry?.contractData().val().instance().storage();
  if (!storage) return state;

  const countByPeriod = new Map<number, number>();
  for (const mapEntry of storage) {
    const key = scValToNative(mapEntry.key()) as unknown[];
    const name = String(key?.[0] ?? '');
    const val = scValToNative(mapEntry.val()) as unknown;
    if (name === 'Paused') state.paused = Boolean(val);
    else if (name === 'PositionCount') state.positionCount = Number(val);
    else if (name === 'PositionCountForPeriod') countByPeriod.set(Number(key?.[1] ?? 0), Number(val));
    else if (name === 'ProtocolFees') state.protocolFees = toStringSafe(val);
    else if (name === 'EarlyWithdrawalFee') state.earlyWithdrawalFeeBps = toStringSafe(val);
    else if (name === 'BlendToken') state.blendToken = String(val);
    else if (name === 'DeFindexVaultAddress') state.vaultAddress = String(val);
    else if (name === 'Periods') {
      const period = val as { reward_pool?: unknown; total_deposits?: unknown };
      state.periods.push({
        periodSeconds: Number(key?.[1] ?? 0),
        totalDeposits: toStringSafe(period?.total_deposits ?? 0),
        rewardPool: toStringSafe(period?.reward_pool ?? 0),
        positionsCount: null,
      });
    }
  }
  for (const period of state.periods) {
    period.positionsCount = countByPeriod.get(period.periodSeconds) ?? null;
  }
  state.periods.sort((a, b) => a.periodSeconds - b.periodSeconds);
  return state;
}

interface LivePosition {
  depositIdHex: string;
  owner: string;
  amount: string;
  shares: string;
  lockPeriodSeconds: number;
  finalizationTime: number;
}

/** Read every Positions(deposit_id) entry that is still live on-chain. */
async function readLivePositions(server: rpc.Server, pool: string, depositIdHexes: string[]): Promise<LivePosition[]> {
  const positions: LivePosition[] = [];
  for (let i = 0; i < depositIdHexes.length; i += LEDGER_KEYS_PER_REQUEST) {
    const chunk = depositIdHexes.slice(i, i + LEDGER_KEYS_PER_REQUEST);
    const res = await server.getLedgerEntries(...chunk.map((hex) => positionLedgerKey(pool, hex)));
    for (const entry of res.entries) {
      const keyVec = entry.key.contractData().key().vec();
      const hex = keyVec?.[1]?.bytes().toString('hex') ?? '';
      const position = scValToNative(entry.val.contractData().val()) as {
        owner?: unknown;
        amount?: unknown;
        shares?: unknown;
        lock_period?: unknown;
        finalization_time?: unknown;
      } | null;
      if (!position) continue;
      positions.push({
        depositIdHex: hex,
        owner: String(position.owner ?? ''),
        amount: toStringSafe(position.amount ?? 0),
        shares: toStringSafe(position.shares ?? 0),
        lockPeriodSeconds: Number(position.lock_period ?? 0),
        finalizationTime: Number(position.finalization_time ?? 0),
      });
    }
  }
  return positions;
}

// GET /api/admin/tokens/onchain?id=123 — on-chain snapshot for one token's pool.
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const idParam = req.nextUrl.searchParams.get('id');
  const id = Number(idParam);
  if (!idParam || !Number.isInteger(id) || id <= 0) return badRequest('Valid id query param required');

  const token = await prisma.token.findFirst({ where: { id, deletedAt: null } });
  if (!token) return NextResponse.json({ status: 'error', message: 'Token not found' }, { status: 404 });

  const pool = token.vaquitaContractAddress;
  if (!pool || !StrKey.isValidContract(pool)) {
    return badRequest('Token has no valid "vaquitaContractAddress" — set it first (Admin → Tokens → Edit).');
  }

  const config = await prisma.config.findFirst({ orderBy: { id: 'asc' } });
  const networkPassphrase = config?.networkPassphrase === Networks.PUBLIC ? Networks.PUBLIC : Networks.TESTNET;
  const rpcUrl = rpcUrlFor(config?.networkPassphrase);
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });

  const warnings: string[] = [];

  try {
    // 1. Pool instance storage: paused flag, counters, per-period totals, and
    //    the token/vault addresses the pool is actually wired to on-chain.
    const instanceRes = await server.getLedgerEntries(instanceLedgerKey(pool));
    const instance = decodeInstanceStorage(instanceRes.entries[0]?.val);
    if (!instanceRes.entries.length) warnings.push('Pool instance storage not found on this network.');

    const tokenContract =
      instance.blendToken ?? (token.contractAddress && StrKey.isValidContract(token.contractAddress) ? token.contractAddress : null);
    const vault =
      instance.vaultAddress ??
      (token.defindexVaultContractAddress && StrKey.isValidContract(token.defindexVaultContractAddress)
        ? token.defindexVaultContractAddress
        : null);
    const poolScVal = new Address(pool).toScVal();

    // 2. Idle token balance sitting in the pool contract itself.
    let idleBalance: string | null = null;
    if (tokenContract) {
      try {
        idleBalance = toStringSafe(await simulateCall(server, networkPassphrase, tokenContract, 'balance', [poolScVal]));
      } catch (error) {
        warnings.push(`Could not read the pool's token balance: ${(error as Error).message}`);
      }
    }

    // 3. DeFindex vault shares owned by the pool, plus their underlying value.
    let vaultShares: string | null = null;
    let vaultUnderlying: string | null = null;
    if (vault) {
      try {
        const shares = await simulateCall(server, networkPassphrase, vault, 'balance', [poolScVal]);
        vaultShares = toStringSafe(shares);
        const amounts = (await simulateCall(server, networkPassphrase, vault, 'get_asset_amounts_per_shares', [
          nativeToScVal(BigInt(vaultShares), { type: 'i128' }),
        ])) as unknown[];
        if (Array.isArray(amounts) && amounts.length) vaultUnderlying = toStringSafe(amounts[0]);
      } catch (error) {
        warnings.push(`Could not read the DeFindex vault position: ${(error as Error).message}`);
      }
    } else {
      warnings.push('No DeFindex vault address on-chain or on the token row — vault position skipped.');
    }

    // 4. Per-address positions: rebuild the persistent-storage keys from the
    //    deposit ids the listener recorded, and read them in bulk. Every known
    //    deposit id is probed (not just rows recorded against this pool): the
    //    id is sha256(caller || nonce) — pool-agnostic — so only positions that
    //    actually live in this pool come back, and rows with a stale or null
    //    vaquitaContractAddress are still covered.
    const deposits = await prisma.deposit.findMany({
      where: { depositIdHex: { not: null }, deletedAt: null },
      select: { depositIdHex: true },
    });
    const depositIdHexes = Array.from(
      new Set(deposits.map((d) => d.depositIdHex ?? '').filter((hex) => /^[0-9a-fA-F]{64}$/.test(hex))),
    );
    const livePositions = await readLivePositions(server, pool, depositIdHexes);

    const decimals = token.decimals ?? null;
    const holdersMap = new Map<string, { totalAmount: bigint; positions: LivePosition[] }>();
    for (const position of livePositions) {
      const holder = holdersMap.get(position.owner) ?? { totalAmount: 0n, positions: [] };
      holder.totalAmount += BigInt(position.amount);
      holder.positions.push(position);
      holdersMap.set(position.owner, holder);
    }
    const holders = Array.from(holdersMap.entries())
      .map(([address, h]) => ({
        address,
        totalAmount: h.totalAmount.toString(),
        totalAmountFormatted: formatUnits(h.totalAmount.toString(), decimals),
        positions: h.positions
          .map((p) => ({
            depositIdHex: p.depositIdHex,
            amount: p.amount,
            amountFormatted: formatUnits(p.amount, decimals),
            shares: p.shares,
            lockPeriodSeconds: p.lockPeriodSeconds,
            finalizationTime: p.finalizationTime,
          }))
          .sort((a, b) => a.finalizationTime - b.finalizationTime),
      }))
      .sort((a, b) => (BigInt(b.totalAmount) > BigInt(a.totalAmount) ? 1 : -1));

    // The pool's own counter is the ground truth for how many positions exist;
    // if we found fewer, some deposits never reached the DB (or were pruned).
    if (instance.positionCount != null && livePositions.length < instance.positionCount) {
      warnings.push(
        `On-chain PositionCount is ${instance.positionCount} but only ${livePositions.length} position(s) matched DB deposit ids — some depositors are missing from this breakdown.`,
      );
    }

    return NextResponse.json({
      data: {
        network: networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet',
        pool,
        token: { symbol: token.symbol, decimals, contractAddress: tokenContract },
        paused: instance.paused,
        positionCount: instance.positionCount,
        protocolFees: instance.protocolFees,
        protocolFeesFormatted: instance.protocolFees != null ? formatUnits(instance.protocolFees, decimals) : null,
        earlyWithdrawalFeeBps: instance.earlyWithdrawalFeeBps,
        idleBalance,
        idleBalanceFormatted: idleBalance != null ? formatUnits(idleBalance, decimals) : null,
        vault: {
          address: vault,
          shares: vaultShares,
          underlying: vaultUnderlying,
          underlyingFormatted: vaultUnderlying != null ? formatUnits(vaultUnderlying, decimals) : null,
        },
        periods: instance.periods.map((p) => ({
          ...p,
          totalDepositsFormatted: formatUnits(p.totalDeposits, decimals),
          rewardPoolFormatted: formatUnits(p.rewardPool, decimals),
        })),
        holders,
        coverage: {
          dbDepositIds: depositIdHexes.length,
          livePositions: livePositions.length,
          positionCountOnChain: instance.positionCount,
        },
        warnings,
      },
    });
  } catch (error) {
    console.error('[tokens/onchain] lookup failed', error);
    const message = error instanceof Error ? error.message : 'On-chain lookup failed';
    return NextResponse.json({ status: 'error', message }, { status: 502 });
  }
}

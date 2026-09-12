import { Address, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { getRpcUrl } from './kit';

/**
 * Finding the withdraw a closed tab never reported.
 *
 * The whole withdraw runs in the browser: build, sign, submit, poll, then tell
 * the API. A reload between the ledger accepting the transaction and that last
 * call leaves the position closed on chain and the row still open, and the
 * position can never be withdrawn again — the on-chain key is gone, so a retry
 * comes back PositionNotFound.
 *
 * The hourly reconciler repairs this, but the user is looking at the wrong
 * balance until it runs. So the tab that lost the call is the one that goes
 * looking for it, and it does the looking itself rather than asking the API to:
 * a server scanning the chain once per visitor is a rate-limit problem, while a
 * browser scanning its own wallet is one RPC conversation per user.
 *
 * Nothing here is trusted downstream. The search produces a transaction hash,
 * the API re-reads that transaction on chain, and the repair is written from
 * what the ledger says — see the reconcile-transaction route.
 */
export interface OpenPositionRef {
  /** The on-chain position id, `deposit_id` in the pool's own terms. */
  depositIdHex: string;
  /** Pool contract this position lives in. */
  pool: string;
}

export interface OrphanedWithdrawal extends OpenPositionRef {
  txHash: string;
}

/**
 * How far back the event scan looks, in ledgers — about a day of mainnet at
 * five seconds a ledger.
 *
 * This bounds a search for a transaction the user made in a tab they still had
 * open, so a day is already generous. It is not a retention policy: a withdraw
 * older than this is left to the hourly reconciler, which scans from a cursor
 * and misses nothing.
 */
const LOOKBACK_LEDGERS = 17_280;

/**
 * The RPC scans a bounded number of ledgers per `getEvents` call — about 10_000,
 * well short of the window above — and hands back a cursor for the rest. Three
 * pages cover the lookback with room to spare.
 */
const MAX_EVENT_PAGES = 3;
const EVENT_PAGE_LIMIT = 200;
/** getLedgerEntries accepts at most 200 keys per request. */
const LEDGER_KEYS_PER_REQUEST = 200;

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Ledger key for a persistent Positions(deposit_id) entry. */
const positionLedgerKey = (pool: string, depositIdHex: string): xdr.LedgerKey =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(pool).toScAddress(),
      key: xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('Positions'),
        xdr.ScVal.scvBytes(Buffer.from(depositIdHex, 'hex')),
      ]),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );

/**
 * The ledger an event cursor sits at: the high 32 bits of the TOID in
 * `<toid>-<eventIndex>`. The RPC returns one even for a page that matched
 * nothing, and it marks where the scan stopped rather than where the last event
 * was — which is what tells this loop whether the window is finished.
 */
const cursorLedger = (cursor: string): number | null => {
  const [toid] = cursor.split('-');
  if (!toid) return null;
  try {
    return Number(BigInt(toid) >> 32n);
  } catch {
    return null;
  }
};

const toHex = (value: unknown): string => {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  return '';
};

/**
 * The positions the DB still calls open that the chain no longer holds.
 *
 * Absence is a reason to go looking, never a verdict on its own: a position
 * whose two-year lock outlives its ninety-day TTL is archived rather than
 * deleted, and reads the same way here. Only a withdraw event closes a row.
 */
const findMissingPositions = async (
  server: rpc.Server,
  positions: OpenPositionRef[],
): Promise<OpenPositionRef[]> => {
  const present = new Set<string>();

  for (const batch of chunk(positions, LEDGER_KEYS_PER_REQUEST)) {
    const response = await server.getLedgerEntries(
      ...batch.map((position) => positionLedgerKey(position.pool, position.depositIdHex)),
    );
    for (const entry of response.entries) {
      const hex = entry.key.contractData().key().vec()?.[1]?.bytes().toString('hex') ?? '';
      if (hex) present.add(hex.toLowerCase());
    }
  }

  return positions.filter((position) => !present.has(position.depositIdHex.toLowerCase()));
};

/**
 * Every withdraw this wallet made in the lookback window, as deposit id → hash.
 *
 * The pool's withdraw topic is `("withdraw", caller)` exactly, so the caller
 * goes into the RPC's own topic filter. The scan comes back holding this one
 * wallet's withdrawals and nothing else, which is what keeps it to a handful of
 * events instead of the pool's whole history.
 */
const findWithdrawHashes = async (
  server: rpc.Server,
  walletAddress: string,
  pools: string[],
): Promise<Map<string, string>> => {
  const { sequence } = await server.getLatestLedger();
  const startLedger = Math.max(1, sequence - LOOKBACK_LEDGERS);
  const filters = [
    {
      type: 'contract' as const,
      contractIds: pools,
      topics: [
        [
          nativeToScVal('withdraw', { type: 'symbol' }).toXDR('base64'),
          new Address(walletAddress).toScVal().toXDR('base64'),
        ],
      ],
    },
  ];

  const hashes = new Map<string, string>();
  let cursor: string | null = null;

  for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
    const response = await server.getEvents(
      cursor
        ? { filters, limit: EVENT_PAGE_LIMIT, cursor }
        : { filters, limit: EVENT_PAGE_LIMIT, startLedger },
    );

    for (const event of response.events ?? []) {
      const data = scValToNative(event.value) as { deposit_id?: unknown } | null;
      const depositId = toHex(data?.deposit_id);
      if (depositId && event.txHash) hashes.set(depositId.toLowerCase(), event.txHash);
    }

    // A page returning few events is not the end of the window: the RPC stops on
    // its ledger budget, not on a full page. Only an exhausted cursor is.
    const next = response.cursor ?? null;
    if (!next) break;
    const reached = cursorLedger(next);
    if (reached === null || reached >= sequence) break;
    cursor = next;
  }

  return hashes;
};

/**
 * Positions the DB still reports as open that the chain says were withdrawn,
 * each paired with the transaction that did it.
 *
 * Returns an empty list — never throws — when the chain agrees with the DB or
 * the RPC cannot be reached. This runs beside the portfolio, and a reconcile
 * that cannot complete is not something to put in front of the user.
 */
export const findOrphanedWithdrawals = async (
  walletAddress: string,
  positions: OpenPositionRef[],
): Promise<OrphanedWithdrawal[]> => {
  if (!walletAddress || positions.length === 0) return [];

  try {
    const server = new rpc.Server(getRpcUrl());
    const missing = await findMissingPositions(server, positions);
    if (missing.length === 0) return [];

    const pools = [...new Set(missing.map((position) => position.pool))];
    const hashes = await findWithdrawHashes(server, walletAddress, pools);

    return missing.flatMap((position) => {
      const txHash = hashes.get(position.depositIdHex.toLowerCase());
      return txHash ? [{ ...position, txHash }] : [];
    });
  } catch (error) {
    console.error('findOrphanedWithdrawals', error);
    return [];
  }
};

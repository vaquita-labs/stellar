import { createHash } from 'node:crypto';
import {
  Account,
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  Operation,
  rpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import type { TestContext } from 'vitest';
import type { InvokeContractParams } from '../sorobanTx';

/**
 * Bridge between the frontend's contract-call payloads and the real Soroban
 * testnet. The app hands Pollar an `invoke_contract` body (typed args as
 * `{ type, value }`); this module encodes that SAME body into an
 * `invokeContractFunction` operation, simulates it, signs it with the
 * integration key and drives it to a ledger verdict — so the suite proves the
 * frontend's argument encoding against the deployed contracts, not a mock.
 *
 * Nothing here touches Pollar: the point is to validate the layer under it.
 */

/** Public testnet deployments the suite targets when the env does not override them. */
export const TESTNET_DEFAULTS = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  friendbotUrl: 'https://friendbot.stellar.org',
  // Blend's testnet faucet: returns a faucet-signed envelope that pays USDC/BLND/wETH/wBTC
  // to `userId` (adding the trustlines), which the recipient co-signs and submits.
  faucetUrl: 'https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets',
  // VaquitaPool (constructor: token below, DeFindex vault, lock_periods [604800], fee 1000 bps).
  poolContractId: 'CBXKHWKQRQB6MKYA3DVGCPLUVJ4CPZWJLPB2AGTCOBPON3ZQ3PX64XZG',
  // VaquitaBadges.
  badgesContractId: 'CA5G54UMXOTEMF4GTTKA3IP25MN7J5632XNPBPZNGXFBUGQSULCCI3T6',
  // Pool token: USDC SAC issued by the Blend testnet faucet account.
  tokenContractId: 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU',
  tokenDecimals: 7,
  lockPeriod: 604_800n,
} as const;

export type IntegrationEnv = {
  keypair: Keypair;
  address: string;
  rpcUrl: string;
  poolContractId: string;
  badgesContractId: string;
  tokenContractId: string;
};

const SECRET_VAR = 'INTEGRATION_STELLAR_SECRET';

/**
 * Resolve the integration environment, or skip the calling test with a clear
 * note when the signing key is absent. Returning `null` after `ctx.skip` lets
 * each test bail with a one-liner instead of failing offline.
 */
export function integrationEnv(ctx: TestContext): IntegrationEnv | null {
  const secret = process.env[SECRET_VAR];
  if (!secret) {
    ctx.skip(`${SECRET_VAR} is not set — testnet integration tests only run with a funded testnet key`);
    return null;
  }
  const keypair = Keypair.fromSecret(secret);
  return {
    keypair,
    address: keypair.publicKey(),
    rpcUrl: process.env.NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL || TESTNET_DEFAULTS.rpcUrl,
    poolContractId: process.env.INTEGRATION_POOL_CONTRACT_ID || TESTNET_DEFAULTS.poolContractId,
    badgesContractId: process.env.INTEGRATION_BADGES_CONTRACT_ID || TESTNET_DEFAULTS.badgesContractId,
    tokenContractId: process.env.INTEGRATION_TOKEN_CONTRACT_ID || TESTNET_DEFAULTS.tokenContractId,
  };
}

type PollarArg = NonNullable<InvokeContractParams['args']>[number];

/**
 * Encode one Pollar `{ type, value }` argument as the ScVal the host expects.
 * Mirrors Pollar's own decoding of the `invoke_contract` body, so a wrong
 * `type`/`value` pair in the frontend builders fails here, at simulation.
 */
export function pollarArgToScVal(arg: PollarArg): xdr.ScVal {
  switch (arg.type) {
    case 'bool':
      return xdr.ScVal.scvBool(arg.value);
    case 'i32':
    case 'u32':
      return nativeToScVal(arg.value, { type: arg.type });
    case 'i64':
    case 'u64':
    case 'i128':
    case 'u128':
    case 'i256':
    case 'u256':
      return nativeToScVal(BigInt(arg.value), { type: arg.type });
    case 'address':
      return new Address(arg.value).toScVal();
    case 'string':
      return xdr.ScVal.scvString(arg.value);
    case 'symbol':
      return xdr.ScVal.scvSymbol(arg.value);
    case 'bytes':
      return xdr.ScVal.scvBytes(Buffer.from(arg.value, 'base64'));
    case 'vec':
      return xdr.ScVal.scvVec((arg.value as PollarArg[]).map(pollarArgToScVal));
    case 'map':
      return xdr.ScVal.scvMap(
        (arg.value as { key: PollarArg; val: PollarArg }[]).map(
          ({ key, val }) => new xdr.ScMapEntry({ key: pollarArgToScVal(key), val: pollarArgToScVal(val) }),
        ),
      );
    case 'void':
      return xdr.ScVal.scvVoid();
    default:
      throw new Error(`unsupported Pollar arg type: ${JSON.stringify(arg)}`);
  }
}

export function toInvokeOperation(params: InvokeContractParams): xdr.Operation {
  return Operation.invokeContractFunction({
    contract: params.contractId,
    function: params.method,
    args: (params.args ?? []).map(pollarArgToScVal),
  });
}

export type SimulationOutcome = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Simulate an `invoke_contract` body from `source`. A live account is used as
 * the source (not a throwaway) so `require_auth` on that address is satisfied
 * by source-account credentials — the same way a wallet-signed tx authorizes.
 */
export async function simulateInvoke(rpcUrl: string, source: string, params: InvokeContractParams): Promise<SimulationOutcome> {
  const server = new rpc.Server(rpcUrl);
  const tx = new TransactionBuilder(new Account(source, '0'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(toInvokeOperation(params))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return { ok: false, error: sim.error };
  return { ok: true, value: sim.result?.retval ? scValToNative(sim.result.retval) : undefined };
}

/** Simulate a read-only contract view with plain ScVal args (no Pollar body involved). */
export async function simulateView(rpcUrl: string, contractId: string, method: string, ...args: xdr.ScVal[]) {
  const server = new rpc.Server(rpcUrl);
  const tx = new TransactionBuilder(new Account(Keypair.random().publicKey(), '0'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${method} simulation failed: ${sim.error}`);
  return sim.result?.retval ? scValToNative(sim.result.retval) : undefined;
}

/** Build → simulate/assemble → sign → send → poll until the ledger settles `params`. */
export async function invokeOnTestnet(env: IntegrationEnv, params: InvokeContractParams): Promise<{ hash: string }> {
  const server = new rpc.Server(env.rpcUrl);
  const account = await server.getAccount(env.address);
  const tx = new TransactionBuilder(account, { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(toInvokeOperation(params))
    .setTimeout(60)
    .build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(env.keypair);
  return submitAndSettle(server, prepared, `${params.method} on ${params.contractId}`);
}

async function submitAndSettle(server: rpc.Server, tx: Transaction, label: string): Promise<{ hash: string }> {
  const sent = await server.sendTransaction(tx);
  if (sent.status !== 'PENDING') {
    throw new Error(`${label}: send returned ${sent.status} ${sent.errorResult?.toXDR('base64') ?? ''}`);
  }
  const settled = await server.pollTransaction(sent.hash, { attempts: 40, sleepStrategy: () => 1500 });
  if (settled.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`${label}: transaction ${sent.hash} ended as ${settled.status}`);
  }
  return { hash: sent.hash };
}

/** SEP-41 `balance(address)` of `tokenId`; a missing trustline reads as 0. */
export async function tokenBalance(rpcUrl: string, tokenId: string, address: string): Promise<bigint> {
  try {
    const raw = await simulateView(rpcUrl, tokenId, 'balance', new Address(address).toScVal());
    return typeof raw === 'bigint' ? raw : 0n;
  } catch {
    return 0n;
  }
}

/**
 * Get the integration account ready for a deposit: create it via friendbot when
 * it does not exist yet, then pull pool tokens from the faucet when its balance
 * is below `minBalance`. Returns the balance after funding; a caller that still
 * sees less than it needs should skip, not fail — funding is a precondition.
 */
export async function ensureFunded(env: IntegrationEnv, minBalance: bigint): Promise<bigint> {
  const server = new rpc.Server(env.rpcUrl);
  try {
    await server.getAccount(env.address);
  } catch {
    const res = await fetch(`${TESTNET_DEFAULTS.friendbotUrl}?addr=${env.address}`);
    if (!res.ok) throw new Error(`friendbot failed: HTTP ${res.status}`);
  }

  const before = await tokenBalance(env.rpcUrl, env.tokenContractId, env.address);
  if (before >= minBalance) return before;

  const res = await fetch(`${TESTNET_DEFAULTS.faucetUrl}?userId=${env.address}`);
  if (!res.ok) throw new Error(`faucet failed: HTTP ${res.status}`);
  const body = (await res.text()).trim().replace(/^"|"$/g, '');
  const tx = TransactionBuilder.fromXDR(body, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw new Error('faucet returned a fee-bump envelope');
  tx.sign(env.keypair);
  await submitAndSettle(server, tx, 'faucet');
  return tokenBalance(env.rpcUrl, env.tokenContractId, env.address);
}

/**
 * `sha256(caller_xdr || nonce_be8)` — the position id the pool derives for
 * `(caller, nonce)`. Computed off-chain here to cross-check the contract's own
 * `compute_deposit_id` view, which is what the frontend relies on.
 */
export function derivePositionIdHex(caller: string, nonce: bigint): string {
  const nonceBytes = Buffer.alloc(8);
  nonceBytes.writeBigUInt64BE(nonce);
  const preimage = Buffer.concat([new Address(caller).toScVal().toXDR(), nonceBytes]);
  return createHash('sha256').update(preimage).digest('hex');
}

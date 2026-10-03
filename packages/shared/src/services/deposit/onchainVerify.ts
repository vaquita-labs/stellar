import { rpc } from '@stellar/stellar-sdk';
import { prisma } from '@vaquita/db';

import { parseVaquitaPoolEvents } from '../reconciliation/parser';
import { listPoolContractIds, poolEventsFrom } from '../reconciliation/transaction';
import type { NormalizedDepositEvent, NormalizedWithdrawEvent } from '../reconciliation/types';
import { resolveSorobanNetwork, type SorobanCallOptions } from '../stellar/rpc';

/**
 * Binding a client-reported hash to the deposit row it claims to settle.
 *
 * `verifyTxSucceeded` only answers "did this hash land?". That is not enough for
 * the deposit endpoints, which carry no session: any successful transaction on
 * the network — somebody else's deposit, a plain payment — used to confirm any
 * row, which minted a position (and its coins, badges and leaderboard weight)
 * the chain never held, and a withdraw-confirm with any hash closed somebody
 * else's position in the app. Here the transaction is re-read and its pool
 * events have to describe exactly this row: same pool, same owner, same nonce,
 * same amount and lock period for a deposit; same position id for a withdrawal.
 */

export type OnchainRowCheck<E> =
  | { ok: true; event: E }
  | { ok: false; status: number; reason: string };

/** The deposit row fields an event has to agree with. */
export interface DepositRowForVerification {
  id: number;
  walletAddress: string;
  amount: { toString(): string } | string | number;
  nonce: bigint | string | number | null;
  depositIdHex: string | null;
  vaquitaContractAddress: string | null;
  tokenDecimals: number | null;
  /** Stored in ms; the event carries seconds. */
  lockPeriodMs: bigint | number | null;
}

const sameText = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Decimal string → base units, truncating like the client does (`toBaseUnits`)
 * so a row and the amount the wallet actually sent compare equal. `null` when
 * the value is not a plain non-negative decimal.
 */
export const decimalToBaseUnits = (value: string, decimals: number): bigint | null => {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole = '0', fraction = ''] = trimmed.split('.');
  return BigInt(whole + fraction.slice(0, decimals).padEnd(decimals, '0'));
};

/** The deposit event in `events` that settles `row`, if there is exactly one. */
export const matchDepositEvent = (
  row: DepositRowForVerification,
  events: NormalizedDepositEvent[],
): OnchainRowCheck<NormalizedDepositEvent> => {
  if (row.tokenDecimals == null) return { ok: false, status: 500, reason: 'Deposit token has no decimals configured' };
  const expectedRaw = decimalToBaseUnits(String(row.amount), row.tokenDecimals);
  if (expectedRaw === null) return { ok: false, status: 500, reason: 'Deposit row has a malformed amount' };
  const rowNonce = row.nonce != null ? String(row.nonce) : null;

  const matches = events.filter(
    (event) =>
      sameText(event.contractId, row.vaquitaContractAddress) &&
      sameText(event.owner, row.walletAddress) &&
      (rowNonce === null || event.nonce === rowNonce) &&
      (row.lockPeriodMs == null || BigInt(event.lockPeriod) * 1000n === BigInt(row.lockPeriodMs)) &&
      BigInt(event.amountRaw) === expectedRaw,
  );
  if (matches.length !== 1) {
    return { ok: false, status: 409, reason: 'Transaction does not contain this deposit' };
  }
  return { ok: true, event: matches[0]! };
};

/** The withdraw event in `events` that closes `row`'s position, if there is exactly one. */
export const matchWithdrawEvent = (
  row: DepositRowForVerification,
  events: NormalizedWithdrawEvent[],
): OnchainRowCheck<NormalizedWithdrawEvent> => {
  const matches = events.filter(
    (event) =>
      sameText(event.contractId, row.vaquitaContractAddress) &&
      sameText(event.owner, row.walletAddress) &&
      sameText(event.depositId, row.depositIdHex),
  );
  if (matches.length !== 1) {
    return { ok: false, status: 409, reason: 'Transaction does not withdraw this position' };
  }
  return { ok: true, event: matches[0]! };
};

const loadDepositRow = async (depositDbId: number): Promise<DepositRowForVerification | null> => {
  const row = await prisma.deposit.findFirst({
    where: { id: depositDbId, deletedAt: null },
    select: {
      id: true,
      walletAddress: true,
      amount: true,
      nonce: true,
      depositIdHex: true,
      vaquitaContractAddress: true,
      lockPeriod: true,
      token: { select: { decimals: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    walletAddress: row.walletAddress,
    amount: row.amount,
    nonce: row.nonce,
    depositIdHex: row.depositIdHex,
    vaquitaContractAddress: row.vaquitaContractAddress,
    tokenDecimals: row.token?.decimals ?? null,
    lockPeriodMs: row.lockPeriod,
  };
};

/** Pool events of one kind emitted by a transaction already known to have succeeded. */
const readPoolEvents = async (
  txHash: string,
  kind: 'deposit' | 'withdraw',
  options: SorobanCallOptions,
) => {
  const rpcUrl = options.rpcUrl ?? resolveSorobanNetwork().rpcUrl;
  const transaction = await new rpc.Server(rpcUrl).getTransaction(txHash);
  if (transaction.status !== rpc.Api.GetTransactionStatus.SUCCESS) return null;
  const contractIds = await listPoolContractIds();
  const raw = poolEventsFrom(transaction, txHash, contractIds, new Set([kind]));
  return parseVaquitaPoolEvents(raw).parsed;
};

const isValidDbId = (id: number) => Number.isSafeInteger(id) && id > 0;

/**
 * Check that `txHash` is the deposit of row `depositDbId`. On success the event
 * is returned so the caller records the position id the chain derived, not the
 * one the client sent.
 */
export const verifyDepositTransactionForRow = async (
  depositDbId: number,
  txHash: string,
  options: SorobanCallOptions = {},
): Promise<OnchainRowCheck<NormalizedDepositEvent>> => {
  if (!isValidDbId(depositDbId)) return { ok: false, status: 400, reason: 'Invalid deposit id' };
  const row = await loadDepositRow(depositDbId);
  if (!row) return { ok: false, status: 404, reason: 'Deposit not found' };

  let events: Awaited<ReturnType<typeof readPoolEvents>>;
  try {
    events = await readPoolEvents(txHash, 'deposit', options);
  } catch (error) {
    console.error('[verifyDepositTransactionForRow] getTransaction', error, { txHash });
    return { ok: false, status: 503, reason: 'Could not read the transaction' };
  }
  if (!events) return { ok: false, status: 409, reason: 'Transaction is not confirmed on chain' };

  const result = matchDepositEvent(row, events.filter((e): e is NormalizedDepositEvent => e.kind === 'deposit'));
  if (!result.ok) return result;

  // One on-chain position backs at most one row: a legacy row without a nonce
  // would otherwise accept a deposit event another row already claimed.
  const claimedElsewhere = await prisma.deposit.findFirst({
    where: {
      id: { not: row.id },
      deletedAt: null,
      depositIdHex: result.event.depositId,
      vaquitaContractAddress: result.event.contractId,
    },
    select: { id: true },
  });
  if (claimedElsewhere) return { ok: false, status: 409, reason: 'Deposit transaction already recorded' };

  return result;
};

/** Check that `txHash` withdrew the position held by row `depositDbId`. */
export const verifyWithdrawTransactionForRow = async (
  depositDbId: number,
  txHash: string,
  options: SorobanCallOptions = {},
): Promise<OnchainRowCheck<NormalizedWithdrawEvent>> => {
  if (!isValidDbId(depositDbId)) return { ok: false, status: 400, reason: 'Invalid deposit id' };
  const row = await loadDepositRow(depositDbId);
  if (!row) return { ok: false, status: 404, reason: 'Deposit not found' };

  let events: Awaited<ReturnType<typeof readPoolEvents>>;
  try {
    events = await readPoolEvents(txHash, 'withdraw', options);
  } catch (error) {
    console.error('[verifyWithdrawTransactionForRow] getTransaction', error, { txHash });
    return { ok: false, status: 503, reason: 'Could not read the transaction' };
  }
  if (!events) return { ok: false, status: 409, reason: 'Transaction is not confirmed on chain' };

  return matchWithdrawEvent(row, events.filter((e): e is NormalizedWithdrawEvent => e.kind === 'withdraw'));
};

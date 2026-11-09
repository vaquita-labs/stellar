import type { TxHistoryRecord } from '@pollar/core';
import { assetCode } from './strings';

export type ActivityKind =
  | 'sent'
  | 'received'
  | 'flexibleIn'
  | 'flexibleOut'
  | 'lockedIn'
  | 'lockedOut'
  | 'badge'
  | 'trust'
  | 'other';

/** One movement of the wallet, in the user's terms, ready for a list row. */
export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** The operation's own words when nothing better is known. */
  summary: string;
  /** Amount and asset when the record carries them. */
  amount: number | null;
  asset: string | null;
  /** The other address of a payment, shortened; null for anything else. */
  counterparty: string | null;
  /** The same address in full, to look up whose it is. */
  counterpartyAddress: string | null;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  timestamp: number;
  hash: string;
  /** What the network charged, when the record says. */
  fee: { amount: number; unit: string } | null;
  /** The position's number in the term savings contract, for a term movement. */
  nonce: string | null;
}

/** What the app knows about its own contracts and token, to tell the records apart. */
export interface ActivityContext {
  /** Flexible savings (DeFindex vault). */
  vault: string | null;
  /** Term savings (Vaquita pool). */
  locks: string | null;
  /** The token's own contract: a `transfer` on it is a payment. */
  token: string | null;
  symbol: string;
  decimals: number;
  /**
   * Margin the app takes off a flexible withdrawal's `min_amounts_out`, in
   * basis points. The call only records that floor, so the amount asked for is
   * read back by undoing it.
   */
  withdrawSlippageBps: number;
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const asNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
/** A contract argument in the token's base units ("20001000") as a plain amount (2.0001). */
const fromBaseUnits = (v: unknown, decimals: number): number | null => {
  const raw = typeof v === 'number' ? String(v) : asString(v);
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw) / 10 ** decimals;
};
const shortAddress = (address: string | null) => (address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null);

/**
 * Signing in to Vaquita signs a challenge: a `manageData` transaction built so
 * it can never be submitted. The wallet's history still lists every one of
 * them, forever "pending". They are not movements, and at one per session they
 * bury the ones that are.
 */
const isSignIn = (operation: string) => operation === 'manageData' || operation === 'manage_data';

/**
 * What a history record means for this wallet, or null when it is not a
 * movement at all. The SDK describes the operation (payment, contract call,
 * ...) and leaves the particulars in `details`; for a contract call those are
 * the raw arguments, read here by each contract's signature.
 */
export function describeRecord(
  record: TxHistoryRecord,
  walletAddress: string,
  context: ActivityContext,
): ActivityItem | null {
  if (isSignIn(record.operation)) return null;

  const details = record.details ?? {};
  const args = Array.isArray(details.args) ? (details.args as unknown[]) : [];
  const method = asString(details.method);
  const contractId = asString(details.contractId) ?? asString(details.contract);
  const { decimals } = context;

  let kind: ActivityKind = 'other';
  let amount = asNumber(details.amount) ?? asNumber(details.value);
  // `details.asset` is the full `CODE:ISSUER` name; a row only has room for the code.
  const rawAsset = asString(details.assetCode) ?? asString(details.asset) ?? asString(details.symbol);
  let asset = rawAsset ? assetCode(rawAsset) : null;
  let counterparty: string | null = null;
  let counterpartyAddress: string | null = null;
  let nonce: string | null = null;

  const payment = (from: string | null, to: string | null) => {
    const received = !!to && to === walletAddress && from !== walletAddress;
    kind = received ? 'received' : 'sent';
    counterpartyAddress = received ? from : to;
    counterparty = shortAddress(counterpartyAddress);
  };

  if (record.operation === 'payment' || record.operation === 'transfer' || record.operation === 'path_payment_strict_send') {
    // A payment the wallet signed carries only where it went.
    payment(asString(details.from) ?? asString(details.source), asString(details.to) ?? asString(details.destination));
  } else if (record.operation === 'change_trust') {
    kind = 'trust';
  } else if (record.operation === 'invoke_contract' && method) {
    const flexible = !!context.vault && contractId === context.vault;
    const locked = !!context.locks && contractId === context.locks;
    if (method === 'deposit' && flexible) {
      // deposit(amounts_desired, amounts_min, from, invest)
      kind = 'flexibleIn';
      amount = fromBaseUnits(first(args[0]), decimals);
    } else if (method === 'withdraw' && flexible) {
      // withdraw(withdraw_shares, min_amounts_out, from)
      kind = 'flexibleOut';
      const floor = fromBaseUnits(first(args[1]), decimals);
      amount = floor === null ? null : (floor * 10_000) / (10_000 - context.withdrawSlippageBps);
    } else if (method === 'deposit' && locked) {
      // deposit(caller, nonce, amount, period)
      kind = 'lockedIn';
      nonce = asString(args[1]);
      amount = fromBaseUnits(args[2], decimals);
    } else if (method === 'withdraw' && locked) {
      // withdraw(caller, nonce): the amount is the position's, not an argument.
      kind = 'lockedOut';
      nonce = asString(args[1]);
    } else if (method === 'mint_badge') {
      kind = 'badge';
    } else if (method === 'transfer' && args.length === 3) {
      // Token contract: transfer(from, to, amount)
      payment(asString(args[0]), asString(args[1]));
      amount = fromBaseUnits(args[2], decimals);
    } else if (method === 'submit') {
      // Blend pool, the flexible savings before the vault:
      // submit(from, spender, to, requests[{ address, amount, request_type }])
      const request = first(args[3]);
      if (request && typeof request === 'object') {
        const { amount: raw, request_type: type } = request as { amount?: unknown; request_type?: unknown };
        const requestType = asNumber(type);
        // 0 supply, 2 supply collateral; 1 withdraw, 3 withdraw collateral.
        if (requestType === 0 || requestType === 2) kind = 'flexibleIn';
        else if (requestType === 1 || requestType === 3) kind = 'flexibleOut';
        if (kind !== 'other') amount = fromBaseUnits(raw, decimals);
      }
    }
  }

  if (!asset && amount !== null) asset = context.symbol;
  const feeAmount = asNumber(record.fee?.amount);

  return {
    id: record.id,
    kind,
    summary: record.summary,
    amount,
    asset,
    counterparty,
    counterpartyAddress,
    status: record.status,
    timestamp: Date.parse(record.createdAt),
    hash: record.hash,
    fee: feeAmount !== null && record.fee ? { amount: feeAmount, unit: record.fee.unit } : null,
    nonce,
  };
}

/** How far apart the two legs of one thing the user did can land. */
const LEG_WINDOW_MS = 5 * 60_000;

/** Same money, give or take the margin a withdrawal asks for and the dust that rides along. */
const sameAmount = (a: number | null, b: number | null) =>
  a === null || b === null || Math.abs(a - b) <= Math.max(0.01, Math.max(a, b) * 0.02);

/**
 * The user's money lives in their savings — the balance they see is term plus
 * flexible — and the wallet is only where it changes hands. So one thing they
 * did often takes two transactions: a send out of savings pulls the money out
 * of the vault and then pays it; a term withdrawal lands in the wallet and is
 * then moved into flexible savings; money received is put to work. The move in
 * or out of flexible savings that only fed the other half is left out, and the
 * row that remains says what happened.
 *
 * It is told apart by landing right next to that other half, for about the
 * same amount (a term withdrawal's amount is not in its record, so there only
 * the timing counts).
 */
const isTransitLeg = (item: ActivityItem, items: ActivityItem[]) => {
  if (item.status !== 'SUCCESS') return false;
  const near = (other: ActivityItem, after: boolean) => {
    const gap = after ? other.timestamp - item.timestamp : item.timestamp - other.timestamp;
    return other.status === 'SUCCESS' && gap >= 0 && gap <= LEG_WINDOW_MS && sameAmount(item.amount, other.amount);
  };
  // Out of flexible, then on its way: paid out or locked for a term.
  if (item.kind === 'flexibleOut') {
    return items.some((other) => (other.kind === 'sent' || other.kind === 'lockedIn') && near(other, true));
  }
  // Into flexible, right after it came in: received or back from a term.
  if (item.kind === 'flexibleIn') {
    return items.some((other) => (other.kind === 'received' || other.kind === 'lockedOut') && near(other, false));
  }
  return false;
};

/** The movements in a page of history, in the order the history gives them. */
export const describeRecords = (records: TxHistoryRecord[], walletAddress: string, context: ActivityContext) => {
  const items = records
    .map((record) => describeRecord(record, walletAddress, context))
    .filter((item): item is ActivityItem => item !== null);
  return items.filter((item) => !isTransitLeg(item, items));
};

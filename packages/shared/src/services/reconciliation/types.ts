import type { DepositStatus, WithdrawalStatus } from '../../types';

export type ReconciliationEventKind = 'deposit' | 'withdraw';

export interface RawReconciliationEvent {
  id?: string;
  pagingToken?: string;
  ledger?: number;
  ledgerClosedAt?: string;
  contractId?: string;
  txHash?: string;
  transactionHash?: string;
  topic?: unknown[];
  value?: unknown;
}

/**
 * What one `fetchEvents` call actually covered.
 *
 * The Soroban RPC caps how many ledgers it scans per `getEvents` call (about
 * 10_000), so a fetcher walking a wide window pages through it and can still
 * stop short — a page cap, an undecodable cursor. `scannedThroughLedger` is the
 * highest ledger the fetch genuinely read, and it is what the cursor may
 * advance to. The requested end is a request, not a receipt: advancing to it
 * after a short read marks ledgers as processed that nobody looked at, and once
 * they age out of RPC retention the events in them are gone for good.
 *
 * A fetcher that returns a bare array is taken at its word for the whole window.
 */
export interface ReconciliationEventPage {
  events: RawReconciliationEvent[];
  scannedThroughLedger: number;
}

export interface NormalizedDepositEvent {
  kind: 'deposit';
  contractId: string;
  eventId: string;
  ledger: number;
  txHash: string;
  ledgerClosedAt?: string;
  caller: string;
  owner: string;
  depositId: string;
  /// Client-supplied nonce this position was derived from (raw u64 as string).
  /// Needed to reconstruct the withdraw call for backfilled deposits.
  nonce: string | null;
  token: string;
  amountRaw: string;
  sharesRaw: string;
  lockPeriod: number;
  raw: RawReconciliationEvent;
}

export interface NormalizedWithdrawEvent {
  kind: 'withdraw';
  contractId: string;
  eventId: string;
  ledger: number;
  txHash: string;
  ledgerClosedAt?: string;
  caller: string;
  owner: string;
  depositId: string;
  token: string;
  amountRaw: string;
  rewardRaw: string;
  earlyFeeRaw: string;
  matured: boolean;
  lockPeriod: number;
  raw: RawReconciliationEvent;
}

export type NormalizedReconciliationEvent = NormalizedDepositEvent | NormalizedWithdrawEvent;

export interface ReconciliationParseIssue {
  eventId: string;
  ledger: number | null;
  contractId: string | null;
  reason: string;
}

export interface ReconciliationWithdrawalRecord {
  id: number;
  depositId: number;
  status: WithdrawalStatus | string;
  transactionHash: string | null;
  /** Decimal column; `null` while the withdrawal has no reward recorded. */
  reward?: { toString(): string } | number | string | null;
}

export interface ReconciliationDepositRecord {
  id: number;
  walletAddress: string;
  depositIdHex: string | null;
  status: DepositStatus | string;
  transactionHash: string | null;
  vaquitaContractAddress: string | null;
  withdrawals: ReconciliationWithdrawalRecord[];
}

export interface ReconciliationTokenRecord {
  id: number;
  contractAddress: string | null;
  vaquitaContractAddress: string | null;
  decimals: number | null;
  lockPeriods: Array<number | bigint>;
}

export interface PlannedConfirmDepositRepair {
  type: 'confirm_deposit';
  depositDbId: number;
  event: NormalizedDepositEvent;
}

export interface PlannedCreateDepositRepair {
  type: 'create_deposit';
  tokenId: number;
  amount: string;
  lockPeriodMs: number;
  event: NormalizedDepositEvent;
}

export type PlannedDepositRepair = PlannedConfirmDepositRepair | PlannedCreateDepositRepair;

export interface PlannedWithdrawalRepair {
  type: 'confirm_withdrawal' | 'create_confirmed_withdrawal';
  depositDbId: number;
  withdrawalDbId?: number;
  event: NormalizedWithdrawEvent;
  /** Reward paid by the pool, as a decimal string; absent when the event pays none. */
  reward?: string;
}

export interface AmbiguousReconciliationEvent {
  kind: ReconciliationEventKind;
  event: NormalizedReconciliationEvent;
  reason:
    | 'missing_deposit'
    | 'duplicate_deposits'
    | 'wallet_mismatch'
    | 'contract_mismatch'
    | 'duplicate_withdrawals'
    | 'unknown_token'
    | 'malformed_amount'
    | 'unsupported_lock_period';
  candidateDepositIds: number[];
  candidateWithdrawalIds?: number[];
}

export interface ReconciliationMatchResult {
  plannedDepositRepairs: PlannedDepositRepair[];
  plannedWithdrawalRepairs: PlannedWithdrawalRepair[];
  ambiguousEvents: AmbiguousReconciliationEvent[];
  skippedEvents: NormalizedReconciliationEvent[];
}

export interface ReconciliationCounts {
  scannedEvents: number;
  parsedEvents: number;
  parseIssues: number;
  plannedDepositRepairs: number;
  plannedWithdrawalRepairs: number;
  ambiguousEvents: number;
  skippedEvents: number;
  appliedDepositRepairs: number;
  appliedWithdrawalRepairs: number;
}

export interface ReconciliationCursorState {
  lastProcessedLedger: number | null;
  lastProcessedEventId: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  status: 'never_run' | 'success' | 'failed';
  errorSummary: string | null;
  counts: ReconciliationCounts | null;
}

export type ReconciliationState = Record<string, Record<string, ReconciliationCursorState>>;

export interface ReconciliationRunInput {
  job: string;
  contractIds: string[];
  startLedger: number;
  endLedger: number;
  dryRun: boolean;
  advanceCursor: boolean;
}

export interface ReconciliationRunOutput {
  job: string;
  contractIds: string[];
  startLedger: number;
  endLedger: number;
  dryRun: boolean;
  advanceCursor: boolean;
  cursorBehavior: 'not_read' | 'read_only' | 'advanced' | 'blocked_ambiguous';
  cursorBefore: ReconciliationState;
  cursorAfter: ReconciliationState;
  /** Highest ledger the fetch actually read; the ceiling for a cursor advance. */
  scannedThroughLedger: number;
  counts: ReconciliationCounts;
  parsedEvents: NormalizedReconciliationEvent[];
  parseIssues: ReconciliationParseIssue[];
  plannedDepositRepairs: PlannedDepositRepair[];
  plannedWithdrawalRepairs: PlannedWithdrawalRepair[];
  ambiguousEvents: AmbiguousReconciliationEvent[];
  skippedEvents: NormalizedReconciliationEvent[];
}

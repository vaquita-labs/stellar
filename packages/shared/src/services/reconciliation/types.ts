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

export interface PlannedDepositRepair {
  type: 'confirm_deposit';
  depositDbId: number;
  event: NormalizedDepositEvent;
}

export interface PlannedWithdrawalRepair {
  type: 'confirm_withdrawal' | 'create_confirmed_withdrawal';
  depositDbId: number;
  withdrawalDbId?: number;
  event: NormalizedWithdrawEvent;
}

export interface AmbiguousReconciliationEvent {
  kind: ReconciliationEventKind;
  event: NormalizedReconciliationEvent;
  reason: 'missing_deposit' | 'duplicate_deposits' | 'wallet_mismatch' | 'contract_mismatch' | 'duplicate_withdrawals';
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
  cursorBehavior: 'not_read' | 'read_only' | 'advanced';
  cursorBefore: ReconciliationState;
  cursorAfter: ReconciliationState;
  counts: ReconciliationCounts;
  parsedEvents: NormalizedReconciliationEvent[];
  parseIssues: ReconciliationParseIssue[];
  plannedDepositRepairs: PlannedDepositRepair[];
  plannedWithdrawalRepairs: PlannedWithdrawalRepair[];
  ambiguousEvents: AmbiguousReconciliationEvent[];
  skippedEvents: NormalizedReconciliationEvent[];
}

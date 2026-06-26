import type { ReconciliationState } from './types';

export interface ResolveReconciliationLedgerRangeInput {
  state: ReconciliationState;
  job: string;
  contractIds: string[];
  latestLedger: number;
  overlapLedgers: number;
  fallbackLookbackLedgers: number;
  fromLedger?: number;
  toLedger?: number;
}

export interface ResolvedReconciliationLedgerRange {
  startLedger: number;
  endLedger: number;
  source: 'manual' | 'cursor' | 'fallback';
}

export const resolveReconciliationLedgerRange = (
  input: ResolveReconciliationLedgerRangeInput,
): ResolvedReconciliationLedgerRange => {
  if (input.fromLedger !== undefined) {
    return {
      startLedger: input.fromLedger,
      endLedger: input.toLedger ?? input.latestLedger,
      source: 'manual',
    };
  }

  const cursors = input.contractIds
    .map((contractId) => input.state[input.job]?.[contractId]?.lastProcessedLedger)
    .filter((ledger): ledger is number => typeof ledger === 'number');

  if (cursors.length > 0) {
    return {
      startLedger: Math.max(0, Math.min(...cursors) - input.overlapLedgers),
      endLedger: input.toLedger ?? input.latestLedger,
      source: 'cursor',
    };
  }

  return {
    startLedger: Math.max(0, input.latestLedger - input.fallbackLookbackLedgers),
    endLedger: input.toLedger ?? input.latestLedger,
    source: 'fallback',
  };
};

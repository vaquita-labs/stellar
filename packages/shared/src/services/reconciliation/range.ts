import type { ReconciliationState } from './types';

export interface ResolveReconciliationLedgerRangeInput {
  state: ReconciliationState;
  job: string;
  contractIds: string[];
  latestLedger: number;
  /** Oldest ledger the RPC still retains; ranges are clamped to it when provided. */
  oldestLedger?: number;
  overlapLedgers: number;
  fallbackLookbackLedgers: number;
  fromLedger?: number;
  toLedger?: number;
}

export interface ResolvedReconciliationLedgerRange {
  startLedger: number;
  endLedger: number;
  source: 'manual' | 'cursor' | 'fallback';
  clamped: boolean;
  requestedStartLedger: number;
  requestedEndLedger: number;
}

const resolveRequestedRange = (
  input: ResolveReconciliationLedgerRangeInput,
): Pick<ResolvedReconciliationLedgerRange, 'startLedger' | 'endLedger' | 'source'> => {
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

export const resolveReconciliationLedgerRange = (
  input: ResolveReconciliationLedgerRangeInput,
): ResolvedReconciliationLedgerRange => {
  const requested = resolveRequestedRange(input);
  const minLedger = input.oldestLedger ?? 0;

  let { startLedger, endLedger, source } = requested;
  endLedger = Math.min(endLedger, input.latestLedger);
  if (startLedger > endLedger) {
    // Cursor or manual range sits beyond the RPC head (e.g. after a testnet
    // reset renumbered ledgers) — restart from the fallback lookback window.
    startLedger = Math.max(0, endLedger - input.fallbackLookbackLedgers);
    source = 'fallback';
  }
  startLedger = Math.max(startLedger, minLedger);

  return {
    startLedger,
    endLedger,
    source,
    clamped: startLedger !== requested.startLedger || endLedger !== requested.endLedger,
    requestedStartLedger: requested.startLedger,
    requestedEndLedger: requested.endLedger,
  };
};

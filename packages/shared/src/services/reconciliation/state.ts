import type { ReconciliationCounts, ReconciliationCursorState, ReconciliationState } from './types';

const emptyCursor = (): ReconciliationCursorState => ({
  lastProcessedLedger: null,
  lastProcessedEventId: null,
  lastRunAt: null,
  lastSuccessAt: null,
  status: 'never_run',
  errorSummary: null,
  counts: null,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const normalizeReconciliationState = (value: unknown): ReconciliationState => {
  if (!isRecord(value)) return {};

  const state: ReconciliationState = {};
  for (const [job, contracts] of Object.entries(value)) {
    if (!isRecord(contracts)) continue;
    state[job] = {};
    for (const [contractId, cursor] of Object.entries(contracts)) {
      const record = isRecord(cursor) ? cursor : {};
      state[job][contractId] = {
        lastProcessedLedger:
          typeof record.lastProcessedLedger === 'number' ? record.lastProcessedLedger : null,
        lastProcessedEventId:
          typeof record.lastProcessedEventId === 'string' ? record.lastProcessedEventId : null,
        lastRunAt: typeof record.lastRunAt === 'string' ? record.lastRunAt : null,
        lastSuccessAt: typeof record.lastSuccessAt === 'string' ? record.lastSuccessAt : null,
        status:
          record.status === 'success' || record.status === 'failed' || record.status === 'never_run'
            ? record.status
            : 'never_run',
        errorSummary: typeof record.errorSummary === 'string' ? record.errorSummary : null,
        counts: isRecord(record.counts) ? (record.counts as unknown as ReconciliationCounts) : null,
      };
    }
  }
  return state;
};

export const updateReconciliationState = (
  state: ReconciliationState,
  job: string,
  contractIds: string[],
  update: {
    lastProcessedLedger: number | null;
    lastProcessedEventId: string | null;
    runAt: string;
    success: boolean;
    errorSummary: string | null;
    counts: ReconciliationCounts;
  },
): ReconciliationState => {
  const next: ReconciliationState = structuredClone(state);
  next[job] ??= {};

  for (const contractId of contractIds) {
    const previous = next[job][contractId] ?? emptyCursor();
    next[job][contractId] = {
      ...previous,
      lastProcessedLedger: update.success ? update.lastProcessedLedger : previous.lastProcessedLedger,
      lastProcessedEventId: update.success ? update.lastProcessedEventId : previous.lastProcessedEventId,
      lastRunAt: update.runAt,
      lastSuccessAt: update.success ? update.runAt : previous.lastSuccessAt,
      status: update.success ? 'success' : 'failed',
      errorSummary: update.errorSummary,
      counts: update.counts,
    };
  }

  return next;
};

import { describe, expect, it } from 'vitest';

import { resolveReconciliationLedgerRange } from './range';
import type { ReconciliationState } from './types';

const state: ReconciliationState = {
  'devnet-pool-events': {
    CCONTRACT1: {
      lastProcessedLedger: 1000,
      lastProcessedEventId: '1000-1',
      lastRunAt: '2026-06-26T00:00:00.000Z',
      lastSuccessAt: '2026-06-26T00:00:00.000Z',
      status: 'success',
      errorSummary: null,
      counts: null,
    },
    CCONTRACT2: {
      lastProcessedLedger: 900,
      lastProcessedEventId: '900-1',
      lastRunAt: '2026-06-26T00:00:00.000Z',
      lastSuccessAt: '2026-06-26T00:00:00.000Z',
      status: 'success',
      errorSummary: null,
      counts: null,
    },
  },
};

describe('resolveReconciliationLedgerRange', () => {
  it('uses explicit manual bounds unchanged', () => {
    expect(resolveReconciliationLedgerRange({
      state,
      job: 'devnet-pool-events',
      contractIds: ['CCONTRACT1'],
      latestLedger: 2000,
      overlapLedgers: 25,
      fallbackLookbackLedgers: 100,
      fromLedger: 1200,
      toLedger: 1300,
    })).toEqual({
      startLedger: 1200,
      endLedger: 1300,
      source: 'manual',
    });
  });

  it('resolves scheduled bounds from the oldest contract cursor with overlap', () => {
    expect(resolveReconciliationLedgerRange({
      state,
      job: 'devnet-pool-events',
      contractIds: ['CCONTRACT1', 'CCONTRACT2'],
      latestLedger: 2000,
      overlapLedgers: 25,
      fallbackLookbackLedgers: 100,
    })).toEqual({
      startLedger: 875,
      endLedger: 2000,
      source: 'cursor',
    });
  });

  it('falls back to latest minus lookback when cursor state is missing', () => {
    expect(resolveReconciliationLedgerRange({
      state,
      job: 'devnet-pool-events',
      contractIds: ['CUNKNOWN'],
      latestLedger: 2000,
      overlapLedgers: 25,
      fallbackLookbackLedgers: 100,
    })).toEqual({
      startLedger: 1900,
      endLedger: 2000,
      source: 'fallback',
    });
  });

  it('uses latest ledger as the default end for a manual from-ledger backfill', () => {
    expect(resolveReconciliationLedgerRange({
      state,
      job: 'devnet-pool-events',
      contractIds: ['CCONTRACT1'],
      latestLedger: 2000,
      overlapLedgers: 25,
      fallbackLookbackLedgers: 100,
      fromLedger: 1500,
    })).toEqual({
      startLedger: 1500,
      endLedger: 2000,
      source: 'manual',
    });
  });
});

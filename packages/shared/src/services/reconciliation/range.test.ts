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
      clamped: false,
      requestedStartLedger: 1200,
      requestedEndLedger: 1300,
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
      clamped: false,
      requestedStartLedger: 875,
      requestedEndLedger: 2000,
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
      clamped: false,
      requestedStartLedger: 1900,
      requestedEndLedger: 2000,
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
      clamped: false,
      requestedStartLedger: 1500,
      requestedEndLedger: 2000,
    });
  });

  it('clamps a cursor start below the RPC retention window up to the oldest retained ledger', () => {
    expect(resolveReconciliationLedgerRange({
      state,
      job: 'devnet-pool-events',
      contractIds: ['CCONTRACT1', 'CCONTRACT2'],
      latestLedger: 2000,
      oldestLedger: 1500,
      overlapLedgers: 25,
      fallbackLookbackLedgers: 100,
    })).toEqual({
      startLedger: 1500,
      endLedger: 2000,
      source: 'cursor',
      clamped: true,
      requestedStartLedger: 875,
      requestedEndLedger: 2000,
    });
  });

  it('clamps a manual start below the RPC retention window', () => {
    expect(resolveReconciliationLedgerRange({
      state,
      job: 'devnet-pool-events',
      contractIds: ['CCONTRACT1'],
      latestLedger: 2000,
      oldestLedger: 1500,
      overlapLedgers: 25,
      fallbackLookbackLedgers: 100,
      fromLedger: 100,
      toLedger: 1800,
    })).toEqual({
      startLedger: 1500,
      endLedger: 1800,
      source: 'manual',
      clamped: true,
      requestedStartLedger: 100,
      requestedEndLedger: 1800,
    });
  });

  it('clamps an end beyond the RPC head down to the latest ledger', () => {
    expect(resolveReconciliationLedgerRange({
      state,
      job: 'devnet-pool-events',
      contractIds: ['CCONTRACT1'],
      latestLedger: 2000,
      oldestLedger: 1500,
      overlapLedgers: 25,
      fallbackLookbackLedgers: 100,
      fromLedger: 1600,
      toLedger: 5000,
    })).toEqual({
      startLedger: 1600,
      endLedger: 2000,
      source: 'manual',
      clamped: true,
      requestedStartLedger: 1600,
      requestedEndLedger: 5000,
    });
  });

  it('restarts from the fallback window when the cursor sits beyond the RPC head', () => {
    const resetState: ReconciliationState = {
      'devnet-pool-events': {
        CCONTRACT1: {
          ...state['devnet-pool-events']!.CCONTRACT1!,
          lastProcessedLedger: 3900000,
        },
      },
    };
    expect(resolveReconciliationLedgerRange({
      state: resetState,
      job: 'devnet-pool-events',
      contractIds: ['CCONTRACT1'],
      latestLedger: 2000,
      oldestLedger: 1500,
      overlapLedgers: 25,
      fallbackLookbackLedgers: 100,
    })).toEqual({
      startLedger: 1900,
      endLedger: 2000,
      source: 'fallback',
      clamped: true,
      requestedStartLedger: 3899975,
      requestedEndLedger: 2000,
    });
  });
});

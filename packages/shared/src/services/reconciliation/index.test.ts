import { describe, expect, it } from 'vitest';

import { runReconciliation, type ReconciliationDependencies } from './index';
import { DepositStatus } from '../../types';
import type { RawReconciliationEvent, ReconciliationState } from './types';

const cursor = (ledger: number): ReconciliationState => ({
  'devnet-pool-events': {
    CCONTRACT: {
      lastProcessedLedger: ledger,
      lastProcessedEventId: 'previous',
      lastRunAt: '2026-06-25T00:00:00.000Z',
      lastSuccessAt: '2026-06-25T00:00:00.000Z',
      status: 'success',
      errorSummary: null,
      counts: null,
    },
  },
});

const depositEvent = (overrides: Partial<RawReconciliationEvent> = {}): RawReconciliationEvent => ({
  id: 'event-1',
  ledger: 100,
  ledgerClosedAt: '2026-06-26T12:00:00.000Z',
  contractId: 'CCONTRACT',
  txHash: 'tx-1',
  topic: ['deposit', 'GOWNER'],
  value: {
    owner: 'GOWNER',
    deposit_id: 'dep-1',
    token: 'CTOKEN',
    amount: 50000000n,
    shares: 50000000n,
    lock_period: 604800,
  },
  ...overrides,
});

const deps = (overrides: Partial<ReconciliationDependencies> = {}): ReconciliationDependencies => ({
  fetchEvents: async () => [depositEvent()],
  loadDeposits: async () => [],
  loadTokens: async () => [{
    id: 7,
    contractAddress: 'CTOKEN',
    vaquitaContractAddress: 'CCONTRACT',
    decimals: 7,
    lockPeriods: [604800000n],
  }],
  loadState: async () => ({}),
  saveState: async () => undefined,
  applyDepositRepair: async () => undefined,
  applyWithdrawalRepair: async () => undefined,
  now: () => new Date('2026-06-26T12:01:00.000Z'),
  ...overrides,
});

describe('runReconciliation', () => {
  it('applies safe missing deposit backfills and advances the cursor', async () => {
    const applied: unknown[] = [];
    const savedStates: ReconciliationState[] = [];

    const result = await runReconciliation(
      {
        job: 'devnet-pool-events',
        contractIds: ['CCONTRACT'],
        startLedger: 90,
        endLedger: 110,
        dryRun: false,
        advanceCursor: true,
      },
      deps({
        applyDepositRepair: async (repair) => {
          applied.push(repair);
        },
        saveState: async (state) => {
          savedStates.push(state);
        },
      }),
    );

    expect(result.cursorBehavior).toBe('advanced');
    expect(result.counts.plannedDepositRepairs).toBe(1);
    expect(result.counts.appliedDepositRepairs).toBe(1);
    expect(applied).toEqual([
      expect.objectContaining({ type: 'create_deposit', amount: '5', lockPeriodMs: 604800000 }),
    ]);
    expect(savedStates[0]?.['devnet-pool-events']?.CCONTRACT?.lastProcessedLedger).toBe(110);
  });

  it('advances the cursor to the scanned end even when the only event is an already-applied one', async () => {
    const savedStates: ReconciliationState[] = [];

    const result = await runReconciliation(
      {
        job: 'devnet-pool-events',
        contractIds: ['CCONTRACT'],
        startLedger: 80,
        endLedger: 110,
        dryRun: false,
        advanceCursor: true,
      },
      deps({
        loadState: async () => cursor(100),
        loadDeposits: async () => [{
          id: 1,
          walletAddress: 'GOWNER',
          depositIdHex: 'dep-1',
          status: DepositStatus.CONFIRMED,
          transactionHash: 'tx-1',
          vaquitaContractAddress: 'CCONTRACT',
          withdrawals: [],
        }],
        saveState: async (state) => {
          savedStates.push(state);
        },
      }),
    );

    expect(result.cursorBehavior).toBe('advanced');
    expect(result.counts.skippedEvents).toBe(1);
    expect(savedStates[0]?.['devnet-pool-events']?.CCONTRACT?.lastProcessedLedger).toBe(110);
  });

  it('advances the cursor only as far as a short fetch actually read', async () => {
    const savedStates: ReconciliationState[] = [];

    // The RPC scans a bounded number of ledgers per call, so a fetcher walking a
    // wide window can stop short. Advancing to the requested end here would mark
    // ledgers 96-110 processed without anyone reading them, and the events in
    // them become unrecoverable once they age out of RPC retention.
    const result = await runReconciliation(
      {
        job: 'devnet-pool-events',
        contractIds: ['CCONTRACT'],
        startLedger: 90,
        endLedger: 110,
        dryRun: false,
        advanceCursor: true,
      },
      deps({
        fetchEvents: async () => ({ events: [depositEvent()], scannedThroughLedger: 95 }),
        loadState: async () => cursor(89),
        saveState: async (state) => {
          savedStates.push(state);
        },
      }),
    );

    expect(result.cursorBehavior).toBe('advanced');
    expect(result.scannedThroughLedger).toBe(95);
    expect(savedStates[0]?.['devnet-pool-events']?.CCONTRACT?.lastProcessedLedger).toBe(95);
  });

  it('never lets a fetch push the cursor past the range it was asked for', async () => {
    const savedStates: ReconciliationState[] = [];

    // The RPC's cursor sits at its scan boundary, which can overshoot the end of
    // a bounded manual run.
    const result = await runReconciliation(
      {
        job: 'devnet-pool-events',
        contractIds: ['CCONTRACT'],
        startLedger: 90,
        endLedger: 110,
        dryRun: false,
        advanceCursor: true,
      },
      deps({
        fetchEvents: async () => ({ events: [depositEvent()], scannedThroughLedger: 9_999 }),
        loadState: async () => cursor(89),
        saveState: async (state) => {
          savedStates.push(state);
        },
      }),
    );

    expect(result.scannedThroughLedger).toBe(110);
    expect(savedStates[0]?.['devnet-pool-events']?.CCONTRACT?.lastProcessedLedger).toBe(110);
  });

  it('blocks cursor advancement when unresolved ambiguous events remain', async () => {
    const savedStates: ReconciliationState[] = [];

    const result = await runReconciliation(
      {
        job: 'devnet-pool-events',
        contractIds: ['CCONTRACT'],
        startLedger: 90,
        endLedger: 110,
        dryRun: false,
        advanceCursor: true,
      },
      deps({
        loadState: async () => cursor(80),
        loadTokens: async () => [],
        saveState: async (state) => {
          savedStates.push(state);
        },
      }),
    );

    expect(result.cursorBehavior).toBe('blocked_ambiguous');
    expect(result.counts.ambiguousEvents).toBe(1);
    expect(savedStates[0]?.['devnet-pool-events']?.CCONTRACT?.lastProcessedLedger).toBe(80);
    expect(savedStates[0]?.['devnet-pool-events']?.CCONTRACT?.status).toBe('failed');
    expect(savedStates[0]?.['devnet-pool-events']?.CCONTRACT?.errorSummary).toContain('ambiguous');
  });
});

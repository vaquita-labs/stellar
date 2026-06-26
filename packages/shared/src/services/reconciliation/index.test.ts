import { describe, expect, it } from 'vitest';

import { runReconciliation, type ReconciliationDependencies } from './index';
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
    expect(savedStates[0]?.['devnet-pool-events']?.CCONTRACT?.lastProcessedLedger).toBe(100);
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

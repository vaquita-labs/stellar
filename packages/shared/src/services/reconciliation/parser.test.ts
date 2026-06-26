import { nativeToScVal } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { parseVaquitaPoolEvent } from './parser';
import type { RawReconciliationEvent } from './types';

const baseEvent = (overrides: Partial<RawReconciliationEvent> = {}): RawReconciliationEvent => ({
  id: '0001',
  ledger: 123,
  ledgerClosedAt: '2026-06-25T10:00:00Z',
  contractId: 'CCONTRACT',
  txHash: 'tx-1',
  topic: ['deposit', 'GOWNER'],
  value: {
    owner: 'GOWNER',
    deposit_id: 'dep-1',
    token: 'CTOKEN',
    amount: 1000n,
    shares: 1000n,
    lock_period: 604800,
  },
  ...overrides,
});

describe('VaquitaPool event parser', () => {
  it('parses deposit events from native test objects', () => {
    const result = parseVaquitaPoolEvent(baseEvent());

    expect(result.issue).toBeNull();
    expect(result.event).toEqual(expect.objectContaining({
      kind: 'deposit',
      eventId: '0001',
      ledger: 123,
      txHash: 'tx-1',
      caller: 'GOWNER',
      owner: 'GOWNER',
      depositId: 'dep-1',
      amountRaw: '1000',
      sharesRaw: '1000',
      lockPeriod: 604800,
    }));
  });

  it('parses withdraw events including matured and early fee fields', () => {
    const result = parseVaquitaPoolEvent(baseEvent({
      id: '0002',
      topic: ['withdraw', 'GOWNER'],
      value: {
        owner: 'GOWNER',
        deposit_id: 'dep-1',
        token: 'CTOKEN',
        amount: 1000n,
        reward: 25n,
        early_fee: 0n,
        matured: true,
        lock_period: 604800,
      },
    }));

    expect(result.issue).toBeNull();
    expect(result.event).toEqual(expect.objectContaining({
      kind: 'withdraw',
      rewardRaw: '25',
      earlyFeeRaw: '0',
      matured: true,
    }));
  });

  it('parses RPC base64 ScVal topic and value shapes', () => {
    const result = parseVaquitaPoolEvent(baseEvent({
      topic: [
        nativeToScVal('deposit', { type: 'symbol' }).toXDR('base64'),
        nativeToScVal('GOWNER').toXDR('base64'),
      ],
      value: nativeToScVal({
        owner: 'GOWNER',
        deposit_id: 'dep-2',
        token: 'CTOKEN',
        amount: 123n,
        shares: 123n,
        lock_period: 2592000,
      }).toXDR('base64'),
    }));

    expect(result.issue).toBeNull();
    expect(result.event).toEqual(expect.objectContaining({
      kind: 'deposit',
      depositId: 'dep-2',
      lockPeriod: 2592000,
    }));
  });

  it('reports malformed payloads', () => {
    const result = parseVaquitaPoolEvent(baseEvent({ value: { owner: 'GOWNER' } }));

    expect(result.event).toBeNull();
    expect(result.issue).toEqual(expect.objectContaining({
      eventId: '0001',
      reason: 'missing_required_payload_fields',
    }));
  });

  it('reports unknown event topics', () => {
    const result = parseVaquitaPoolEvent(baseEvent({ topic: ['rewards'] }));

    expect(result.event).toBeNull();
    expect(result.issue).toEqual(expect.objectContaining({
      reason: 'unknown_event_topic',
    }));
  });
});

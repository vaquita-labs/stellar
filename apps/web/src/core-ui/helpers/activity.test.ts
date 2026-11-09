import type { TxHistoryRecord } from '@pollar/core';
import { describe, expect, it } from 'vitest';
import { type ActivityContext, describeRecord, describeRecords } from './activity';
import { buildMovements, type AppTransaction } from './transactions';

const WALLET = 'GWALLET';
const OTHER = 'GOTHERADDRESS';
const context: ActivityContext = {
  vault: 'CVAULT',
  locks: 'CLOCKS',
  token: 'CTOKEN',
  symbol: 'USDC',
  decimals: 7,
  withdrawSlippageBps: 50,
};

// The shapes below are the ones the wallet's history returns.
const record = (over: Partial<TxHistoryRecord>): TxHistoryRecord => ({
  id: 'r1',
  chain: 'STELLAR',
  hash: 'abc',
  network: 'mainnet',
  status: 'SUCCESS',
  operation: 'invoke_contract',
  details: {},
  summary: 'Invoke',
  createdAt: '2026-11-01T00:25:59.647Z',
  ...over,
});
const call = (contractId: string, method: string, args: unknown[]) =>
  record({ details: { contractId, method, args, hostFunction: 'invokeContract' } });

describe('describeRecord', () => {
  it('leaves the sign-in challenge out', () => {
    expect(describeRecord(record({ operation: 'manageData', status: 'PENDING' }), WALLET, context)).toBeNull();
  });

  it('reads a flexible deposit', () => {
    const item = describeRecord(call('CVAULT', 'deposit', [['20001000'], ['20001000'], WALLET, true]), WALLET, context);
    expect(item).toMatchObject({ kind: 'flexibleIn', amount: 2.0001, asset: 'USDC' });
  });

  it('reads a flexible withdrawal back from its floor', () => {
    const item = describeRecord(call('CVAULT', 'withdraw', ['19664632', ['19900000'], WALLET]), WALLET, context);
    expect(item?.kind).toBe('flexibleOut');
    expect(item?.amount).toBeCloseTo(2, 6);
  });

  it('reads a term deposit and a term withdrawal', () => {
    expect(describeRecord(call('CLOCKS', 'deposit', [WALLET, '2', '10000000', '2592000']), WALLET, context)).toMatchObject({
      kind: 'lockedIn',
      amount: 1,
    });
    expect(describeRecord(call('CLOCKS', 'withdraw', [WALLET, '2']), WALLET, context)).toMatchObject({
      kind: 'lockedOut',
      amount: null,
      nonce: '2',
    });
  });

  it('reads a payment and a token transfer as money sent', () => {
    const payment = record({
      operation: 'payment',
      details: { asset: 'USDC:GISSUER', amount: '1.0000000', destination: OTHER },
      fee: { amount: '0.0000120', unit: 'XLM' },
    });
    expect(describeRecord(payment, WALLET, context)).toMatchObject({
      kind: 'sent',
      amount: 1,
      asset: 'USDC',
      counterparty: 'GOTH…RESS',
      fee: { amount: 0.000012, unit: 'XLM' },
    });
    expect(describeRecord(call('CTOKEN', 'transfer', [WALLET, OTHER, '10000030']), WALLET, context)).toMatchObject({
      kind: 'sent',
      amount: 1.000003,
    });
    expect(describeRecord(call('CTOKEN', 'transfer', [OTHER, WALLET, '10000000']), WALLET, context)?.kind).toBe('received');
  });

  it('reads the old Blend savings by request type', () => {
    const submit = (type: number) =>
      call('CBLEND', 'submit', [WALLET, WALLET, WALLET, [{ amount: '5000000', address: 'CTOKEN', request_type: type }]]);
    expect(describeRecord(submit(2), WALLET, context)).toMatchObject({ kind: 'flexibleIn', amount: 0.5 });
    expect(describeRecord(submit(3), WALLET, context)).toMatchObject({ kind: 'flexibleOut', amount: 0.5 });
  });

  it('names a badge and an enabled asset', () => {
    expect(describeRecord(call('CBADGES', 'mint_badge', [WALLET, 'second_deposit', 0, '1', 'sig']), WALLET, context)?.kind).toBe(
      'badge',
    );
    const trust = record({ operation: 'change_trust', details: { asset: 'ARS:GISSUER', sponsored: true } });
    expect(describeRecord(trust, WALLET, context)).toMatchObject({ kind: 'trust', asset: 'ARS', amount: null });
  });
});

describe('describeRecords', () => {
  it('folds the withdrawal that fed a send into the send', () => {
    const at = Date.parse('2026-11-08T23:44:00.000Z');
    const iso = (ms: number) => new Date(ms).toISOString();
    const items = describeRecords(
      [
        record({ id: 'send', operation: 'payment', createdAt: iso(at + 5_000), details: { amount: '260', destination: OTHER } }),
        record({
          id: 'out',
          createdAt: iso(at),
          details: { contractId: 'CVAULT', method: 'withdraw', args: ['1', ['2587001000'], WALLET] },
        }),
        // A withdrawal of its own, hours before, stays.
        record({
          id: 'own',
          createdAt: iso(at - 3_600_000),
          details: { contractId: 'CVAULT', method: 'withdraw', args: ['1', ['2587001000'], WALLET] },
        }),
      ],
      WALLET,
      context,
    );
    expect(items.map((item) => item.id)).toEqual(['send', 'own']);
    expect(items[0]).toMatchObject({ kind: 'sent', counterpartyAddress: OTHER });
  });

  it('folds the move into flexible that follows a term withdrawal', () => {
    const at = Date.parse('2026-10-31T17:40:00.000Z');
    const iso = (ms: number) => new Date(ms).toISOString();
    const items = describeRecords(
      [
        record({
          id: 'in',
          createdAt: iso(at + 60_000),
          details: { contractId: 'CVAULT', method: 'deposit', args: [['10100000'], ['10100000'], WALLET, true] },
        }),
        record({ id: 'term', createdAt: iso(at), details: { contractId: 'CLOCKS', method: 'withdraw', args: [WALLET, '2'] } }),
      ],
      WALLET,
      context,
    );
    expect(items.map((item) => item.id)).toEqual(['term']);
  });
});

describe('buildMovements', () => {
  it('keeps one row for a term movement both sources know', () => {
    const activity = describeRecords(
      [
        record({ id: 'r1', hash: 'ABC', details: { contractId: 'CLOCKS', method: 'deposit', args: [WALLET, '2', '10000000', '1'] } }),
        record({ id: 'r2', hash: 'def', operation: 'payment', details: { amount: '1', destination: OTHER } }),
        record({ id: 'r3', hash: 'ghi', operation: 'manageData' }),
      ],
      WALLET,
      context,
    );
    const transaction = { id: 'd-2', kind: 'move', status: 'completed', timestamp: 1, transactionHash: 'abc' } as AppTransaction;
    const movements = buildMovements([transaction], activity);
    expect(movements.map((movement) => movement.id).sort()).toEqual(['d-2', 'r2']);
    expect(movements.find((movement) => movement.id === 'r2')).toMatchObject({ source: 'chain', category: 'payment' });
  });

  it('recognizes a term withdrawal the API saved under another hash', () => {
    const at = Date.parse('2026-10-31T20:41:42.617Z');
    const withdrawal = (over: Partial<TxHistoryRecord>) =>
      describeRecords(
        [record({ hash: 'onchain', createdAt: new Date(at).toISOString(), details: { contractId: 'CLOCKS', method: 'withdraw', args: [WALLET, '2'] }, ...over })],
        WALLET,
        context,
      );
    const transaction = {
      id: 'w-115-90',
      kind: 'withdraw',
      status: 'completed',
      nonce: '2',
      timestamp: at - 83_000,
      transactionHash: 'another',
    } as AppTransaction;
    expect(buildMovements([transaction], withdrawal({})).map((movement) => movement.id)).toEqual(['w-115-90']);
    // A failed attempt is its own event, and so is the same position months apart.
    expect(buildMovements([transaction], withdrawal({ status: 'FAILED' }))).toHaveLength(2);
    expect(buildMovements([{ ...transaction, timestamp: at - 86_400_000 }], withdrawal({}))).toHaveLength(2);
  });
});

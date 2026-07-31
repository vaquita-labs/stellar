import type { PollarClient } from '@pollar/core';
import { describe, expect, it } from 'vitest';
import { invokeViaPollar, toBaseUnits } from './sorobanTx';

type Deferred = { resolve: (outcome: unknown) => void; reject: (error: unknown) => void };

/**
 * Stand-in for `PollarClient` whose submissions never settle on their own:
 * `pending[i]` is the i-th submission, resolved or rejected by the test. `emit`
 * pushes a transaction state to whatever `submitAndSettle` subscribed.
 */
const makeClient = () => {
  const listeners = new Set<(state: unknown) => void>();
  const pending: Deferred[] = [];
  const client = {
    onTransactionStateChange: (cb: (state: unknown) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getTxStatus: async () => ({ status: 'SUCCESS' as const }),
    buildAndSignAndSubmitTx: () =>
      new Promise((resolve, reject) => {
        pending.push({ resolve: resolve as Deferred['resolve'], reject });
      }),
  };
  return {
    client: client as unknown as PollarClient,
    pending,
    emit: (state: unknown) => listeners.forEach((l) => l(state)),
  };
};

// The in-flight lock is module state keyed by the request signature, so each test
// uses its own amount: a shared one would let an unsettled call from an earlier
// test swallow the call under test.
const params = (amount: string) => ({
  contractId: 'CVAULT',
  method: 'deposit',
  args: [{ type: 'i128' as const, value: amount }],
});

describe('toBaseUnits', () => {
  it('scales a decimal string to base units', () => {
    expect(toBaseUnits('1.5', 7)).toBe(15_000_000n);
    expect(toBaseUnits('0.0000001', 7)).toBe(1n);
    expect(toBaseUnits('283.0008070', 7)).toBe(2_830_008_070n);
  });

  it('truncates past the token decimals instead of rounding up', () => {
    expect(toBaseUnits('1.99999999', 7)).toBe(19_999_999n);
  });

  it('rejects a non-numeric amount', () => {
    expect(() => toBaseUnits('abc', 7)).toThrow('Invalid amount');
  });
});

describe('invokeViaPollar', () => {
  it('coalesces identical calls made before the transaction is broadcast', async () => {
    const { client, pending } = makeClient();

    const first = invokeViaPollar(client, params('100'), 'test');
    const second = invokeViaPollar(client, params('100'), 'test');
    expect(pending).toHaveLength(1);

    pending[0].resolve({ status: 'success', hash: 'HASH_1' });
    await expect(first).resolves.toEqual({ hash: 'HASH_1' });
    await expect(second).resolves.toEqual({ hash: 'HASH_1' });
  });

  it('does not coalesce calls with different arguments', async () => {
    const { client, pending } = makeClient();

    const first = invokeViaPollar(client, params('200'), 'test');
    const second = invokeViaPollar(client, params('201'), 'test');
    expect(pending).toHaveLength(2);

    pending[0].resolve({ status: 'success', hash: 'HASH_A' });
    pending[1].resolve({ status: 'success', hash: 'HASH_B' });
    await expect(first).resolves.toEqual({ hash: 'HASH_A' });
    await expect(second).resolves.toEqual({ hash: 'HASH_B' });
  });

  it('lets a deliberate repeat through once the first one is broadcast', async () => {
    const { client, pending, emit } = makeClient();

    const first = invokeViaPollar(client, params('300'), 'test');
    // Broadcast: the wallet prompt the lock guards against is already gone, so an
    // identical deposit from here on is a second movement, not a double-click.
    emit({ step: 'submitted', hash: 'HASH_1' });

    const second = invokeViaPollar(client, params('300'), 'test');
    expect(pending).toHaveLength(2);

    pending[0].resolve({ status: 'success', hash: 'HASH_1' });
    pending[1].resolve({ status: 'success', hash: 'HASH_2' });
    await expect(first).resolves.toEqual({ hash: 'HASH_1' });
    await expect(second).resolves.toEqual({ hash: 'HASH_2' });
  });

  it('releases the lock when the submission fails, so a retry is a fresh call', async () => {
    const { client, pending } = makeClient();

    const first = invokeViaPollar(client, params('400'), 'test');
    pending[0].resolve({ status: 'error', details: 'Error(Contract, #10)' });
    await expect(first).rejects.toThrow('Error(Contract, #10)');

    const retry = invokeViaPollar(client, params('400'), 'test');
    expect(pending).toHaveLength(2);

    pending[1].resolve({ status: 'success', hash: 'HASH_RETRY' });
    await expect(retry).resolves.toEqual({ hash: 'HASH_RETRY' });
  });

  it('waits for the chain verdict before resolving a pending submission', async () => {
    const { client, pending } = makeClient();

    const call = invokeViaPollar(client, params('500'), 'test');
    pending[0].resolve({ status: 'pending', hash: 'HASH_1' });

    // getTxStatus reports SUCCESS, so the hash comes back ledger-confirmed.
    await expect(call).resolves.toEqual({ hash: 'HASH_1' });
  });
});

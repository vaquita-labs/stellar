import { describe, expect, it, vi } from 'vitest';
import {
  awaitTxSettlement,
  describeOutcomeError,
  isTxPendingError,
  runWithErrorCapture,
  submitAndSettle,
  TxPendingError,
  type PollarTxStatus,
  type SettleClient,
} from './pollarError';

/** Poll with no delay so the settlement tests stay instant. */
const FAST = { intervalMs: 0 };

type StateListener = (state: unknown) => void;

/**
 * Stand-in for `PollarClient`: `emit` pushes a transaction state to whatever
 * `runWithErrorCapture` subscribed, and `getTxStatus` replays `statuses` in order
 * (the last one repeats once the list runs out).
 */
const makeClient = (statuses: (PollarTxStatus | Error)[] = []) => {
  const listeners = new Set<StateListener>();
  let calls = 0;
  const client: SettleClient & { emit: StateListener; statusCalls: () => number; listenerCount: () => number } = {
    onTransactionStateChange: (cb) => {
      listeners.add(cb as StateListener);
      return () => listeners.delete(cb as StateListener);
    },
    getTxStatus: async () => {
      const next = statuses[Math.min(calls, statuses.length - 1)];
      calls += 1;
      if (next instanceof Error) throw next;
      return next ?? { status: 'PENDING' };
    },
    emit: (state) => listeners.forEach((l) => l(state)),
    statusCalls: () => calls,
    listenerCount: () => listeners.size,
  };
  return client;
};

describe('describeOutcomeError', () => {
  it('prefers the outcome details over everything else', () => {
    expect(describeOutcomeError({ details: 'boom' }, { details: 'older' }, 'fallback')).toBe('boom');
  });

  it('falls back to the captured state error when the outcome carries no reason', () => {
    expect(describeOutcomeError({}, { message: 'from state' }, 'fallback')).toBe('from state');
  });

  it('reads a reasonless signing failure as the user declining in the wallet', () => {
    expect(describeOutcomeError({ phase: 'signing' }, null, 'fallback')).toBe(
      'User declined the signature request in the wallet',
    );
    expect(describeOutcomeError({}, { phase: 'building-signing-submitting' }, 'fallback')).toBe(
      'User declined the signature request in the wallet',
    );
  });

  it('uses the fallback when there is neither a reason nor a signing phase', () => {
    expect(describeOutcomeError({ phase: 'submitting' }, null, 'fallback')).toBe('fallback');
  });
});

describe('runWithErrorCapture', () => {
  it('captures the last error state and unsubscribes when done', async () => {
    const client = makeClient();
    const { outcome, lastError } = await runWithErrorCapture(client, async () => {
      client.emit({ step: 'error', phase: 'signing', details: 'declined' });
      return { status: 'error' as const };
    });

    expect(outcome.status).toBe('error');
    expect(lastError).toEqual({ phase: 'signing', details: 'declined', message: undefined, code: undefined });
    expect(client.listenerCount()).toBe(0);
  });

  it('unsubscribes even when the submission throws', async () => {
    const client = makeClient();
    await expect(
      runWithErrorCapture(client, async () => {
        throw new Error('network down');
      }),
    ).rejects.toThrow('network down');
    expect(client.listenerCount()).toBe(0);
  });

  it('reports the hash once, as soon as the transaction is broadcast', async () => {
    const client = makeClient();
    const onBroadcast = vi.fn();
    await runWithErrorCapture(
      client,
      async () => {
        client.emit({ step: 'submitting' });
        client.emit({ step: 'submitted', hash: 'HASH' });
        client.emit({ step: 'success', hash: 'HASH' });
        return { status: 'success' as const, hash: 'HASH' };
      },
      onBroadcast,
    );

    expect(onBroadcast).toHaveBeenCalledExactlyOnceWith('HASH');
  });

  it('does not report a broadcast for states without a hash', async () => {
    const client = makeClient();
    const onBroadcast = vi.fn();
    await runWithErrorCapture(
      client,
      async () => {
        client.emit({ step: 'building' });
        client.emit({ step: 'error', phase: 'building' });
        return { status: 'error' as const };
      },
      onBroadcast,
    );

    expect(onBroadcast).not.toHaveBeenCalled();
  });
});

describe('awaitTxSettlement', () => {
  it('returns once the chain reports SUCCESS', async () => {
    const client = makeClient([{ status: 'PENDING' }, { status: 'SUCCESS' }]);
    await expect(awaitTxSettlement(client, 'HASH', FAST)).resolves.toBeUndefined();
    expect(client.statusCalls()).toBe(2);
  });

  it('throws the chain reason when the transaction FAILED', async () => {
    const client = makeClient([{ status: 'FAILED', message: 'insufficient balance' }]);
    await expect(awaitTxSettlement(client, 'HASH', FAST)).rejects.toThrow('insufficient balance');
  });

  it('falls back to the result code when a FAILED status has no message', async () => {
    const client = makeClient([{ status: 'FAILED', resultCode: 'txFAILED' }]);
    await expect(awaitTxSettlement(client, 'HASH', FAST)).rejects.toThrow('txFAILED');
  });

  it('keeps polling through status-read failures instead of guessing', async () => {
    const client = makeClient([new Error('rpc down'), new Error('rpc down'), { status: 'SUCCESS' }]);
    await expect(awaitTxSettlement(client, 'HASH', FAST)).resolves.toBeUndefined();
    expect(client.statusCalls()).toBe(3);
  });

  it('reports the transaction as still pending when the window runs out', async () => {
    const client = makeClient([{ status: 'PENDING' }]);
    await expect(awaitTxSettlement(client, 'HASH', { ...FAST, maxPolls: 3 })).rejects.toThrow(TxPendingError);
    expect(client.statusCalls()).toBe(3);
  });

  it('reports the transaction as still pending when every status read failed', async () => {
    const client = makeClient([new Error('rpc down')]);
    const error = await awaitTxSettlement(client, 'HASH', { ...FAST, maxPolls: 2 }).catch((e) => e);
    expect(isTxPendingError(error)).toBe(true);
    expect((error as TxPendingError).hash).toBe('HASH');
  });
});

describe('submitAndSettle', () => {
  it('returns the hash of a ledger-confirmed submission without polling again', async () => {
    const client = makeClient();
    const result = await submitAndSettle(client, async () => ({ status: 'success' as const, hash: 'HASH' }), 'failed', FAST);

    expect(result).toEqual({ hash: 'HASH' });
    expect(client.statusCalls()).toBe(0);
  });

  it('waits out a pending submission and returns its hash once it confirms', async () => {
    const client = makeClient([{ status: 'SUCCESS' }]);
    const result = await submitAndSettle(client, async () => ({ status: 'pending' as const, hash: 'HASH' }), 'failed', FAST);

    expect(result).toEqual({ hash: 'HASH' });
    expect(client.statusCalls()).toBe(1);
  });

  it('throws when a pending submission turns out to have failed on chain', async () => {
    const client = makeClient([{ status: 'FAILED', message: 'Error(Contract, #10)' }]);
    await expect(
      submitAndSettle(client, async () => ({ status: 'pending' as const, hash: 'HASH' }), 'failed', FAST),
    ).rejects.toThrow('Error(Contract, #10)');
  });

  it('throws TxPendingError when a pending submission never settles', async () => {
    const client = makeClient([{ status: 'PENDING' }]);
    await expect(
      submitAndSettle(client, async () => ({ status: 'pending' as const, hash: 'HASH' }), 'failed', {
        ...FAST,
        maxPolls: 2,
      }),
    ).rejects.toThrow(TxPendingError);
  });

  it('throws the described reason for an error outcome', async () => {
    const client = makeClient();
    await expect(
      submitAndSettle(
        client,
        async () => {
          client.emit({ step: 'error', phase: 'signing' });
          return { status: 'error' as const };
        },
        'deposit failed',
        FAST,
      ),
    ).rejects.toThrow('User declined the signature request in the wallet');
  });

  it('treats a non-error outcome without a hash as a failure', async () => {
    const client = makeClient();
    await expect(
      submitAndSettle(client, async () => ({ status: 'success' as const }), 'deposit failed', FAST),
    ).rejects.toThrow('deposit failed');
  });

  it('reports the broadcast hash before the pending poll resolves', async () => {
    const client = makeClient([{ status: 'SUCCESS' }]);
    const seen: string[] = [];
    await submitAndSettle(
      client,
      async () => {
        client.emit({ step: 'submitted', hash: 'HASH' });
        return { status: 'pending' as const, hash: 'HASH' };
      },
      'failed',
      { ...FAST, onBroadcast: (hash) => seen.push(hash) },
    );

    expect(seen).toEqual(['HASH']);
  });
});

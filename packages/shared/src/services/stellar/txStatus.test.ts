import { rpc } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTxVerdict, verifyTxSucceeded } from './txStatus';

const OPTIONS = { rpcUrl: 'https://rpc.test', intervalMs: 0 };

/** Replay `results` from `rpc.Server.getTransaction`; an Error entry is thrown. */
const stubRpc = (results: (rpc.Api.GetTransactionStatus | Error)[]) => {
  let calls = 0;
  const spy = vi.spyOn(rpc.Server.prototype, 'getTransaction').mockImplementation(async () => {
    const next = results[Math.min(calls, results.length - 1)];
    calls += 1;
    if (next instanceof Error) throw next;
    return { status: next } as Awaited<ReturnType<rpc.Server['getTransaction']>>;
  });
  return { spy, calls: () => calls };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getTxVerdict', () => {
  it('reports a landed transaction as SUCCESS', async () => {
    stubRpc([rpc.Api.GetTransactionStatus.SUCCESS]);
    await expect(getTxVerdict('HASH', OPTIONS)).resolves.toBe('SUCCESS');
  });

  it('reports a rejected transaction as FAILED', async () => {
    stubRpc([rpc.Api.GetTransactionStatus.FAILED]);
    await expect(getTxVerdict('HASH', OPTIONS)).resolves.toBe('FAILED');
  });

  it('reports a transaction the chain does not know as NOT_FOUND', async () => {
    stubRpc([rpc.Api.GetTransactionStatus.NOT_FOUND]);
    await expect(getTxVerdict('HASH', OPTIONS)).resolves.toBe('NOT_FOUND');
  });

  it('distinguishes an unreadable RPC from a real verdict', async () => {
    stubRpc([new Error('rpc down')]);
    await expect(getTxVerdict('HASH', OPTIONS)).resolves.toBe('UNREADABLE');
  });

  it('treats an empty hash as NOT_FOUND without calling the RPC', async () => {
    const { spy } = stubRpc([rpc.Api.GetTransactionStatus.SUCCESS]);
    await expect(getTxVerdict('', OPTIONS)).resolves.toBe('NOT_FOUND');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('verifyTxSucceeded', () => {
  it('returns as soon as the verdict is final', async () => {
    const { calls } = stubRpc([rpc.Api.GetTransactionStatus.SUCCESS]);
    await expect(verifyTxSucceeded('HASH', OPTIONS)).resolves.toBe('SUCCESS');
    expect(calls()).toBe(1);
  });

  it('does not keep polling a failed transaction', async () => {
    const { calls } = stubRpc([rpc.Api.GetTransactionStatus.FAILED]);
    await expect(verifyTxSucceeded('HASH', OPTIONS)).resolves.toBe('FAILED');
    expect(calls()).toBe(1);
  });

  it('retries while the chain has not seen the transaction yet', async () => {
    const { calls } = stubRpc([
      rpc.Api.GetTransactionStatus.NOT_FOUND,
      rpc.Api.GetTransactionStatus.NOT_FOUND,
      rpc.Api.GetTransactionStatus.SUCCESS,
    ]);
    await expect(verifyTxSucceeded('HASH', OPTIONS)).resolves.toBe('SUCCESS');
    expect(calls()).toBe(3);
  });

  it('gives up as NOT_FOUND once the attempts run out', async () => {
    const { calls } = stubRpc([rpc.Api.GetTransactionStatus.NOT_FOUND]);
    await expect(verifyTxSucceeded('HASH', { ...OPTIONS, maxPolls: 3 })).resolves.toBe('NOT_FOUND');
    expect(calls()).toBe(3);
  });

  it('never turns an unreadable RPC into a success', async () => {
    stubRpc([new Error('rpc down')]);
    await expect(verifyTxSucceeded('HASH', { ...OPTIONS, maxPolls: 2 })).resolves.toBe('UNREADABLE');
  });
});

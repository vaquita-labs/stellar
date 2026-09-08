import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BridgeTransfer } from '@vaquita/db';
import { prisma } from '@vaquita/db';
import { getStatus } from '../oneclick';
import { refreshTransfer, refreshTransfers, type OneClickConfig } from './index';

vi.mock('@vaquita/db', () => ({
  Prisma: {},
  prisma: { bridgeTransfer: { update: vi.fn() } },
}));

vi.mock('../oneclick', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../oneclick')>()),
  getStatus: vi.fn(),
}));

const db = vi.mocked(prisma, { deep: true });
const readStatus = vi.mocked(getStatus);

const config: OneClickConfig = { baseUrl: 'https://1click.example' };

const row = (overrides: Partial<BridgeTransfer> = {}): BridgeTransfer =>
  ({
    id: 'e594f956-0000-4000-8000-000000000000',
    status: 'PENDING_DEPOSIT',
    depositAddress: '0xDb4E5f202700bd60A894AA6Df785e49f57CaB537',
    depositMemo: null,
    sourceTxHash: null,
    destinationTxHash: null,
    errorReason: null,
    ...overrides,
  }) as BridgeTransfer;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('refreshTransfer', () => {
  // The whole point of the callback. A 1Click outage, a timeout and a rate-limit
  // all land here, and before this they were indistinguishable from a slow swap:
  // the row does not move, the client polls on, and nothing says why.
  it('reports a failed status read without touching the row', async () => {
    readStatus.mockResolvedValue({ ok: false, reason: '1Click request timed out' });
    const seen: unknown[] = [];

    const result = await refreshTransfer(config, row(), (failure) => seen.push(failure));

    expect(seen).toEqual([
      {
        transferId: 'e594f956-0000-4000-8000-000000000000',
        depositAddress: '0xDb4E5f202700bd60A894AA6Df785e49f57CaB537',
        status: 'PENDING_DEPOSIT',
        reason: '1Click request timed out',
      },
    ]);
    // Writing FAILED here would strand funds that are still moving.
    expect(db.bridgeTransfer.update).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING_DEPOSIT');
  });

  it('does not report anything when the read succeeds', async () => {
    readStatus.mockResolvedValue({ ok: true, data: { status: 'PENDING_DEPOSIT' } });
    const onError = vi.fn();

    await refreshTransfer(config, row(), onError);

    expect(onError).not.toHaveBeenCalled();
    // Same status, no hashes: nothing changed, so nothing is written.
    expect(db.bridgeTransfer.update).not.toHaveBeenCalled();
  });

  it('persists a status change', async () => {
    readStatus.mockResolvedValue({
      ok: true,
      data: {
        status: 'SUCCESS',
        swapDetails: { destinationChainTxHashes: [{ hash: 'abc' }] },
      },
    });
    db.bridgeTransfer.update.mockResolvedValue(row({ status: 'SUCCESS' }));

    await refreshTransfer(config, row({ status: 'PROCESSING' }));

    expect(db.bridgeTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS', destinationTxHash: 'abc' }) }),
    );
  });

  // A row with nothing to ask about must not spend a request — nor produce a
  // warn line that would make a healthy list read look like an outage.
  it.each([
    ['terminal', row({ status: 'SUCCESS' })],
    ['without a deposit address', row({ depositAddress: null })],
  ])('skips a row %s', async (_label, input) => {
    const onError = vi.fn();

    await refreshTransfer(config, input, onError);

    expect(readStatus).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('refreshTransfers', () => {
  it('forwards the callback to every row', async () => {
    readStatus.mockResolvedValue({ ok: false, reason: '1Click 429' });
    const onError = vi.fn();

    await refreshTransfers(config, [row({ id: 'a' }), row({ id: 'b' })], onError);

    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls.map(([failure]) => failure.transferId)).toEqual(['a', 'b']);
  });
});

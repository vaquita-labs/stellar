import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@vaquita/db';
import { getWalletPositions } from '../stellar/wallet-positions';
import { LAZY_REFRESH_MAX_AGE_MS, lazyRefreshWalletBalances } from './onchainBalances';

vi.mock('@vaquita/db', () => ({
  Prisma: {},
  prisma: {
    token: { findMany: vi.fn() },
    config: { findFirst: vi.fn() },
    profile: { count: vi.fn(), findMany: vi.fn() },
    deposit: { findMany: vi.fn() },
    walletBalance: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock('../stellar/wallet-positions', () => ({ getWalletPositions: vi.fn() }));

const db = vi.mocked(prisma, { deep: true });
const readChain = vi.mocked(getWalletPositions);

// A real Stellar address — `isScrapableWallet` checks the checksum, so a
// placeholder is silently skipped and the test would pass for the wrong reason.
const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const rpc = () => 'https://rpc.invalid';

beforeEach(() => {
  vi.clearAllMocks();
  db.token.findMany.mockResolvedValue([
    { id: 2, isSupported: true, decimals: 7, contractAddress: 'CUSDC', defindexVaultContractAddress: 'CVAULT', blendPoolContractAddress: 'CPOOL' },
  ] as never);
  db.config.findFirst.mockResolvedValue({ id: 1, networkPassphrase: 'Test SDF Network ; September 2015' } as never);
  db.profile.count.mockResolvedValue(1 as never);
  db.deposit.findMany.mockResolvedValue([] as never);
  db.walletBalance.findMany.mockResolvedValue([] as never);
  db.walletBalance.findFirst.mockResolvedValue(null as never);
  db.walletBalance.upsert.mockResolvedValue({} as never);
  readChain.mockResolvedValue({ blendUsdc: 0, vaultUsdc: 250 } as never);
});

describe('lazyRefreshWalletBalances', () => {
  it('reads the chain and writes the snapshot when nothing is cached', async () => {
    await expect(lazyRefreshWalletBalances(WALLET, { resolveRpcUrl: rpc })).resolves.toBe(true);

    expect(readChain).toHaveBeenCalledTimes(1);
    expect(db.walletBalance.upsert).toHaveBeenCalledTimes(1);
  });

  it('no-ops inside the TTL without touching the chain', async () => {
    db.walletBalance.findFirst.mockResolvedValue({ id: 'row' } as never);

    await expect(lazyRefreshWalletBalances(WALLET, { resolveRpcUrl: rpc })).resolves.toBe(false);

    expect(readChain).not.toHaveBeenCalled();
    expect(db.walletBalance.upsert).not.toHaveBeenCalled();
  });

  it('judges freshness on scrapedAt, so a wallet whose reads keep failing is still throttled', async () => {
    await lazyRefreshWalletBalances(WALLET, { resolveRpcUrl: rpc });

    const where = db.walletBalance.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({ walletAddress: WALLET });
    expect(where.scrapedAt).toBeDefined();
    expect(where.observedAt).toBeUndefined();
  });

  it('skips the TTL query entirely when forced', async () => {
    await expect(
      lazyRefreshWalletBalances(WALLET, { maxAgeMs: 0, resolveRpcUrl: rpc }),
    ).resolves.toBe(true);

    expect(db.walletBalance.findFirst).not.toHaveBeenCalled();
    expect(readChain).toHaveBeenCalledTimes(1);
  });

  it('shares one read between concurrent triggers for the same wallet', async () => {
    // A deposit confirmation and an app open landing together must not become
    // two RPC reads — concurrency, not steady-state rate, is what trips the 429s.
    const [a, b, c] = await Promise.all([
      lazyRefreshWalletBalances(WALLET, { maxAgeMs: 0, resolveRpcUrl: rpc }),
      lazyRefreshWalletBalances(WALLET, { maxAgeMs: 0, resolveRpcUrl: rpc }),
      lazyRefreshWalletBalances(WALLET, { maxAgeMs: 0, resolveRpcUrl: rpc }),
    ]);

    expect([a, b, c]).toEqual([true, true, true]);
    expect(readChain).toHaveBeenCalledTimes(1);
  });

  it('releases the single-flight slot after a failure, so the next call retries', async () => {
    db.token.findMany.mockRejectedValueOnce(new Error('db down'));

    await expect(
      lazyRefreshWalletBalances(WALLET, { maxAgeMs: 0, resolveRpcUrl: rpc }),
    ).rejects.toThrow('db down');

    await expect(
      lazyRefreshWalletBalances(WALLET, { maxAgeMs: 0, resolveRpcUrl: rpc }),
    ).resolves.toBe(true);
  });

  it('refuses an address that is not a valid Stellar account', async () => {
    await expect(lazyRefreshWalletBalances('not-a-wallet')).resolves.toBe(false);
    expect(db.walletBalance.findFirst).not.toHaveBeenCalled();
  });

  it('defaults to the shared max age when none is given', () => {
    expect(LAZY_REFRESH_MAX_AGE_MS).toBe(10 * 60 * 1000);
  });
});

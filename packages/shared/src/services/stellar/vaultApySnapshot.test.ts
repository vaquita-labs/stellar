import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@vaquita/db';
import {
  VAULT_APY_SNAPSHOT_MAX_AGE_MS,
  readVaultApySnapshot,
  writeVaultApySnapshot,
} from './vaultApySnapshot';

vi.mock('@vaquita/db', () => ({
  prisma: { vaultApySnapshot: { upsert: vi.fn(), findUnique: vi.fn() } },
}));

const store = vi.mocked(prisma.vaultApySnapshot, { deep: true });
const NOW = new Date('2026-08-20T12:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe('writeVaultApySnapshot', () => {
  it('upserts on the (network, vault) key', async () => {
    store.upsert.mockResolvedValue({} as never);

    await writeVaultApySnapshot('mainnet', 'CVAULT', 5.25);

    expect(store.upsert).toHaveBeenCalledWith({
      where: { network_vaultAddress: { network: 'mainnet', vaultAddress: 'CVAULT' } },
      create: { network: 'mainnet', vaultAddress: 'CVAULT', apy: 5.25, fetchedAt: NOW },
      update: { apy: 5.25, fetchedAt: NOW },
    });
  });

  it('swallows write failures so cache upkeep cannot fail a request', async () => {
    store.upsert.mockRejectedValue(new Error('db down'));

    await expect(writeVaultApySnapshot('mainnet', 'CVAULT', 5.25)).resolves.toBeUndefined();
  });
});

describe('readVaultApySnapshot', () => {
  const row = (ageMs: number) => ({ apy: 5.25, fetchedAt: new Date(NOW.getTime() - ageMs) });

  it('returns the stored rate when it is inside the max age', async () => {
    store.findUnique.mockResolvedValue(row(VAULT_APY_SNAPSHOT_MAX_AGE_MS - 1) as never);

    await expect(readVaultApySnapshot('mainnet', 'CVAULT')).resolves.toBe(5.25);
  });

  it('refuses a rate older than the max age rather than showing a dead number', async () => {
    store.findUnique.mockResolvedValue(row(VAULT_APY_SNAPSHOT_MAX_AGE_MS + 1) as never);

    await expect(readVaultApySnapshot('mainnet', 'CVAULT')).resolves.toBeNull();
  });

  it('honours a caller-supplied max age', async () => {
    store.findUnique.mockResolvedValue(row(60_000) as never);

    await expect(readVaultApySnapshot('mainnet', 'CVAULT', 30_000)).resolves.toBeNull();
    await expect(readVaultApySnapshot('mainnet', 'CVAULT', 120_000)).resolves.toBe(5.25);
  });

  it('returns null when no snapshot exists', async () => {
    store.findUnique.mockResolvedValue(null as never);

    await expect(readVaultApySnapshot('mainnet', 'CVAULT')).resolves.toBeNull();
  });

  it('returns null when the read itself fails', async () => {
    store.findUnique.mockRejectedValue(new Error('db down'));

    await expect(readVaultApySnapshot('mainnet', 'CVAULT')).resolves.toBeNull();
  });
});

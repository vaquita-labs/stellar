import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@vaquita/db';
import {
  depositExperience,
  getVaultExperienceByWallet,
  getVaultUsdcHoursByWallet,
  vaultExperience,
} from './index';

vi.mock('@vaquita/db', () => ({
  Prisma: {},
  prisma: {
    token: { findMany: vi.fn() },
    walletBalance: { findMany: vi.fn() },
  },
}));

const db = vi.mocked(prisma, { deep: true });

const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const OTHER = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBQ';

beforeEach(() => {
  vi.clearAllMocks();
  db.token.findMany.mockResolvedValue([{ id: 2 }] as never);
  db.walletBalance.findMany.mockResolvedValue([] as never);
});

describe('getVaultUsdcHoursByWallet', () => {
  it('scopes the read to supported tokens', async () => {
    db.token.findMany.mockResolvedValue([{ id: 2 }, { id: 5 }] as never);

    await getVaultUsdcHoursByWallet([WALLET]);

    // Rows survive a token being retired, and production had two tokens on the
    // SAME DeFindex vault — an unscoped sum counts that money twice.
    expect(db.walletBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenId: { in: [2, 5] } , walletAddress: { in: [WALLET] } } }),
    );
  });

  it('sums a wallet’s token rows before the square root is taken', async () => {
    db.walletBalance.findMany.mockResolvedValue([
      { walletAddress: WALLET, vaultUsdcHours: 400 },
      { walletAddress: WALLET, vaultUsdcHours: 500 },
    ] as never);

    const byWallet = await getVaultUsdcHoursByWallet([WALLET]);

    // 900 -> 30. Taking the root first would give sqrt(400)+sqrt(500) ~= 42.4,
    // paying more for the same money split across two token ids.
    expect(byWallet.get(WALLET)).toBe(900);
    expect(vaultExperience(byWallet.get(WALLET)!)).toBe(30);
  });

  it('keeps wallets apart', async () => {
    db.walletBalance.findMany.mockResolvedValue([
      { walletAddress: WALLET, vaultUsdcHours: 100 },
      { walletAddress: OTHER, vaultUsdcHours: 900 },
    ] as never);

    const byWallet = await getVaultUsdcHoursByWallet();

    expect(byWallet.get(WALLET)).toBe(100);
    expect(byWallet.get(OTHER)).toBe(900);
  });

  it('short-circuits on an empty wallet list without querying', async () => {
    await getVaultUsdcHoursByWallet([]);

    expect(db.token.findMany).not.toHaveBeenCalled();
    expect(db.walletBalance.findMany).not.toHaveBeenCalled();
  });

  it('returns nothing rather than throwing when the read fails', async () => {
    db.walletBalance.findMany.mockRejectedValue(new Error('db down'));

    // A snapshot table being unavailable must not take the leaderboard down.
    await expect(getVaultUsdcHoursByWallet([WALLET])).resolves.toEqual(new Map());
  });

  it('returns nothing when no token is supported', async () => {
    db.token.findMany.mockResolvedValue([] as never);

    await expect(getVaultUsdcHoursByWallet([WALLET])).resolves.toEqual(new Map());
    expect(db.walletBalance.findMany).not.toHaveBeenCalled();
  });
});

describe('getVaultExperienceByWallet', () => {
  it('is on the same scale as an equivalent locked deposit', async () => {
    // 1000 USDC held in the vault for 100 hours.
    db.walletBalance.findMany.mockResolvedValue([
      { walletAddress: WALLET, vaultUsdcHours: 1000 * 100 },
    ] as never);

    await expect(getVaultExperienceByWallet(WALLET)).resolves.toBeCloseTo(
      depositExperience(1000, 0, 100 * 3_600_000),
      9,
    );
  });

  it('is zero for a wallet with no snapshot row', async () => {
    await expect(getVaultExperienceByWallet(WALLET)).resolves.toBe(0);
  });

  it('is zero for a profile with no wallet, without querying', async () => {
    await expect(getVaultExperienceByWallet(null)).resolves.toBe(0);
    expect(db.walletBalance.findMany).not.toHaveBeenCalled();
  });
});

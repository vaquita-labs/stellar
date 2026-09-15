import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Redeeming is only interesting at its guards, so the fixture is the viewer's
 * row as the upsert returns it and the referrer the code resolves to.
 */
const db = vi.hoisted(() => ({
  viewer: { id: 10, referredById: null as number | null, createdAt: new Date() },
  referrer: { id: 1, walletAddress: 'G_REFERRER', deletedAt: null as Date | null } as
    | { id: number; walletAddress: string; deletedAt: Date | null }
    | null,
  update: vi.fn(async () => ({})),
}));

vi.mock('@vaquita/db', () => ({
  prisma: {
    profile: {
      upsert: vi.fn(async () => db.viewer),
      findFirst: vi.fn(async () => db.referrer),
      update: db.update,
    },
  },
}));

vi.mock('../wallets/onchainBalances', () => ({
  getSupportedTokenIds: vi.fn(async () => [2]),
}));

import { REFERRAL_NEW_ACCOUNT_WINDOW_MS, redeemReferralCode } from './index';

const ageMs = (ms: number) => new Date(Date.now() - ms);

beforeEach(() => {
  db.viewer = { id: 10, referredById: null, createdAt: new Date() };
  db.referrer = { id: 1, walletAddress: 'G_REFERRER', deletedAt: null };
  db.update.mockClear();
});

describe('redeemReferralCode', () => {
  it('attributes a brand-new account to the referrer', async () => {
    db.viewer.createdAt = ageMs(2 * 60 * 1000);

    await expect(redeemReferralCode('G_NEW', 'friend')).resolves.toEqual({
      success: true,
      referrerWallet: 'G_REFERRER',
    });
    expect(db.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { referredById: 1 } });
  });

  it('refuses an account that existed before the referral window', async () => {
    db.viewer.createdAt = ageMs(REFERRAL_NEW_ACCOUNT_WINDOW_MS + 1000);

    const result = await redeemReferralCode('G_OLD', 'friend');

    expect(result.success).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('still refuses an account that already has a referrer', async () => {
    db.viewer.referredById = 3;

    expect((await redeemReferralCode('G_NEW', 'friend')).success).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('still refuses redeeming your own code', async () => {
    db.referrer = { id: 10, walletAddress: 'G_NEW', deletedAt: null };

    expect((await redeemReferralCode('G_NEW', 'me')).success).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });
});

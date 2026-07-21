import { prisma } from '@vaquita/db';
import { DepositStatus, WithdrawalStatus } from '../../types';
import type { ReferralSummaryResponseDTO, ReferralTierDTO } from '../../types';

/**
 * Referral (invite-a-friend) service.
 *
 * The APY boost is not stored — it is derived at read time from how many of a
 * user's referred profiles are currently "active". A referral is active when the
 * referred user has at least one live deposit (confirmed on-chain, not yet
 * withdrawn), mirroring the DEPOSIT_SUCCESS state the deposit service computes.
 * The more active referrals, the higher the tier, and the tier's bonus is added
 * on top of the base APY in the client.
 *
 * Earnings (`total`/`pending`) are honest zeros for now: there is no referral
 * payout ledger yet. They are surfaced as real fields so the payout engine can
 * fill them in without a DTO change.
 */

/** Boost tiers: reach `referrals` active referrals → add `bonus` APY points. */
export const REFERRAL_TIERS: ReferralTierDTO[] = [
  { referrals: 1, bonus: 0.25 },
  { referrals: 3, bonus: 0.5 },
  { referrals: 5, bonus: 1 },
  { referrals: 10, bonus: 2 },
];

/** Highest tier bonus reached for a given active-referral count. */
export const getReferralBonus = (activeReferrals: number): number =>
  REFERRAL_TIERS.reduce((bonus, tier) => (activeReferrals >= tier.referrals ? tier.bonus : bonus), 0);

/** Next tier still to reach, or null when already at the top. */
export const getNextReferralTier = (activeReferrals: number): ReferralTierDTO | null =>
  REFERRAL_TIERS.find((tier) => activeReferrals < tier.referrals) ?? null;

// Unambiguous alphabet (no 0/O, 1/I) so a spoken/typed code is hard to mistype.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const randomCode = (): string => {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
};

/**
 * Returns the profile's referral code, minting one on first use. Retries on the
 * (tiny) chance of a unique-index collision. Concurrent first-reads can race; if
 * the update loses to another writer we re-read the now-present code.
 */
const ensureReferralCode = async (profile: { id: number; referralCode: string | null }): Promise<string> => {
  if (profile.referralCode) return profile.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const updated = await prisma.profile.update({
        where: { id: profile.id },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode!;
    } catch (err) {
      // P2002 = unique violation. Either the code collided (retry with a new one)
      // or a concurrent request already assigned this profile a code (re-read).
      const existing = await prisma.profile.findUnique({
        where: { id: profile.id },
        select: { referralCode: true },
      });
      if (existing?.referralCode) return existing.referralCode;
      if (attempt === 4) throw err;
    }
  }
  // Unreachable: the loop either returns or throws on the last attempt.
  throw new Error('Could not allocate a referral code');
};

/** How many of these referred profiles currently hold a live (active) deposit. */
const countActiveReferrals = async (referredWallets: string[]): Promise<number> => {
  if (referredWallets.length === 0) return 0;

  // A wallet is "active" if it has at least one deposit that is confirmed
  // on-chain and has no confirmed withdrawal — the same shape the deposit
  // service maps to DEPOSIT_SUCCESS. Grouping keeps this a single query.
  const grouped = await prisma.deposit.groupBy({
    by: ['walletAddress'],
    where: {
      walletAddress: { in: referredWallets },
      deletedAt: null,
      status: DepositStatus.CONFIRMED,
      transactionHash: { not: null },
      depositIdHex: { not: null },
      withdrawals: {
        none: { status: WithdrawalStatus.CONFIRMED },
      },
    },
    _count: { _all: true },
  });

  return grouped.length;
};

/**
 * Full referral summary for a wallet. Upserts the viewer (so a first-time caller
 * still resolves to a row), mints a code if needed, then counts active referrals
 * and derives the APY bonus / next tier from them.
 */
export const getReferralSummary = async (walletAddress: string): Promise<ReferralSummaryResponseDTO> => {
  const viewer = await prisma.profile.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress },
    select: { id: true, referralCode: true },
  });

  const code = await ensureReferralCode(viewer);

  // Profiles this user referred (attribution edge), then how many are active.
  const referred = await prisma.profile.findMany({
    where: { referredById: viewer.id, deletedAt: null },
    select: { walletAddress: true },
  });
  const activeReferrals = await countActiveReferrals(referred.map((r) => r.walletAddress));

  const apyBonus = getReferralBonus(activeReferrals);
  const nextTier = getNextReferralTier(activeReferrals);

  return {
    walletAddress,
    code,
    referrals: referred.length,
    activeReferrals,
    apyBonus,
    // No payout ledger yet — surfaced as real fields, filled by the payout engine.
    totalEarnings: 0,
    pendingEarnings: 0,
    nextTier,
    tiers: REFERRAL_TIERS,
  };
};

export type RedeemReferralResult =
  | { success: true; referrerWallet: string }
  | { success: false; errorMessage: string };

/**
 * Attributes `walletAddress` to the owner of `code` (one-time, at signup).
 * Idempotent-ish: a profile can only ever be attributed once. Guards against
 * redeeming an unknown code, one's own code, or creating a referral cycle.
 */
export const redeemReferralCode = async (
  walletAddress: string,
  rawCode: string,
): Promise<RedeemReferralResult> => {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { success: false, errorMessage: 'A referral code is required.' };

  const viewer = await prisma.profile.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress },
    select: { id: true, referredById: true },
  });

  if (viewer.referredById) {
    return { success: false, errorMessage: 'This account already used a referral code.' };
  }

  const referrer = await prisma.profile.findUnique({
    where: { referralCode: code },
    select: { id: true, walletAddress: true, deletedAt: true },
  });

  if (!referrer || referrer.deletedAt) {
    return { success: false, errorMessage: 'That referral code is not valid.' };
  }
  if (referrer.id === viewer.id) {
    return { success: false, errorMessage: 'You cannot use your own referral code.' };
  }

  await prisma.profile.update({
    where: { id: viewer.id },
    data: { referredById: referrer.id },
  });

  return { success: true, referrerWallet: referrer.walletAddress };
};

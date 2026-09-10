import { prisma } from '@vaquita/db';

import { Reward } from '../../types/commons';
import { getRewardsConfig } from '../project-config';
import { REWARD_REASON_DEPOSIT } from './constants';

/**
 * Coins for putting money into savings — locked or flexible, one rule for both.
 *
 * Before this, no deposit of either kind paid a coin: the only sources were the
 * daily check-in and claiming a badge. The rate is one coin per whole USDC,
 * which reads to a user as "a dollar is a coin" and needs no explaining.
 *
 * Two guards keep it from being farmed:
 *
 * - **A one-USDC minimum.** Below it the grant is zero. Ten of the 86 confirmed
 *   production deposits are under a dollar, so this deliberately excludes about
 *   an eighth of historical activity — which is the point, since dust deposits
 *   cost a network fee and nothing else.
 * - **A daily cap**, per UTC calendar day, across both products. Uncapped, one
 *   large deposit would out-pay a Diamond badge. The cap lives in `config`
 *   rather than in a constant here for the same reason `dailyGoldCoins` does:
 *   it is an economy dial and it will be tuned without a deploy.
 */

/** Deposits below this earn nothing. */
export const MIN_DEPOSIT_FOR_COINS_USDC = 1;

/**
 * What a deposit of `amountUsdc` pays, given what the day has already paid out.
 *
 * Pure, so the arithmetic is testable without a database — which matters more
 * than usual here, since the failure mode is paying a user twice.
 */
export function depositCoinsFor(amountUsdc: number, dailyCap: number, grantedToday: number): number {
  if (!Number.isFinite(amountUsdc) || amountUsdc < MIN_DEPOSIT_FOR_COINS_USDC) return 0;
  const remaining = dailyCap - grantedToday;
  if (remaining <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(amountUsdc), remaining));
}

/** Midnight UTC of the day `at` falls in. The cap window, and nothing else. */
export function startOfUtcDay(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * Coins already granted to this profile for deposits today.
 *
 * Summed rather than counted: a single $66 deposit and sixty-six $1 deposits
 * have to consume the same allowance.
 */
export async function getDepositCoinsGrantedToday(profileId: number, at: Date = new Date()): Promise<number> {
  const rows = await prisma.profileReward.findMany({
    where: {
      profileId,
      reason: REWARD_REASON_DEPOSIT,
      reward: { key: Reward.GOLD_COIN },
      createdAt: { gte: startOfUtcDay(at) },
    },
    select: { amount: true },
  });
  return rows.reduce((total, row) => total + Number(row.amount ?? 0), 0);
}

/**
 * Credit a deposit's coins, capped by what the day has left.
 *
 * Never throws: every caller is on the success path of a transaction that
 * already landed on chain, so a bookkeeping failure has to stay a bookkeeping
 * failure. Returns the coins actually granted, which is 0 whenever the deposit
 * was too small, the cap is spent, or the ledger could not be written.
 *
 * Callers are responsible for calling this only once per deposit. Neither side
 * can rely on this function to notice a replay: the flexible side gates on a
 * real insert against the unique transaction hash, and the locked side on the
 * `initiated` → `confirmed` transition, because `deposits` has no such hash
 * constraint and the reconciler re-confirms rows.
 */
export async function grantDepositCoins(profileId: number, amountUsdc: number): Promise<number> {
  try {
    const [{ depositCoinsDailyCap }, grantedToday] = await Promise.all([
      getRewardsConfig(),
      getDepositCoinsGrantedToday(profileId),
    ]);

    const coins = depositCoinsFor(amountUsdc, depositCoinsDailyCap, grantedToday);
    if (coins <= 0) return 0;

    const reward = await prisma.reward.findFirst({ where: { key: Reward.GOLD_COIN }, select: { id: true } });
    if (!reward) return 0;

    await prisma.profileReward.create({
      data: {
        profileId,
        rewardId: BigInt(reward.id),
        amount: coins,
        reason: REWARD_REASON_DEPOSIT,
      },
    });
    return coins;
  } catch (error) {
    console.warn('[depositCoins] failed to grant deposit coins', error);
    return 0;
  }
}

/**
 * Same grant, keyed by wallet instead of profile.
 *
 * A deposit is keyed by wallet and the reward ledger by profile, so something
 * has to bridge the two. A wallet with no profile earns nothing and that is not
 * an error — it is a wallet that deposited before finishing onboarding.
 */
export async function grantDepositCoinsForWallet(
  walletAddress: string | null | undefined,
  amountUsdc: number,
): Promise<number> {
  if (!walletAddress) return 0;
  try {
    const profile = await prisma.profile.findFirst({
      where: { walletAddress, deletedAt: null },
      select: { id: true },
    });
    if (!profile) return 0;
    return grantDepositCoins(profile.id, amountUsdc);
  } catch (error) {
    console.warn('[depositCoins] failed to resolve profile for deposit coins', error);
    return 0;
  }
}

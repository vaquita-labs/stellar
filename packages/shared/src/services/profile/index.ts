import { Prisma, prisma } from '@vaquita/db';
import type { Achievement as PrismaAchievement, Profile as PrismaProfile } from '@vaquita/db';
import { getCurrentDay } from '../../helpers/date';
import { ably } from '../ably';
import { getMintedBadges } from '../badges/claims';
import {
  Achievement,
  type AchievementDocument,
  type AchievementResponseDTO,
  type BadgeRule,
  type BadgeUnlockType,
  type CatalogAchievementResponseDTO,
  DepositStatus,
  type MapObject,
  MapObjectType,
  type Profile,
  type ProfileAchievement,
  type ProfileAchievementsResponseDTO,
  type ProfileExperienceResponseDTO,
  type ProfileMapObjectsAvailableResponseDTO,
  type ProfileMapObjectsResponseDTO,
  type ProfileResponseDTO,
  type ProfileRewardsResponseDTO,
  type ProfileStreakResponseDTO,
  Reward,
  type RewardDocument,
  type RewardResponseDTO,
} from '../../types';
import { getRewardsConfig } from '../project-config';
import { REWARD_REASON_DAILY_CHECKIN } from './constants';
import { friendlyStandardMap } from './map-template';
import { evaluateRule } from './rules';

// ---------------------------------------------------------------------------
// Prisma row → legacy snake_case shape mappers.
//
// The service still speaks the snake_case `Profile` / `AchievementDocument`
// shapes the DTOs and routes expect, but the rows now come from Prisma
// (camelCase). These mappers keep the boundary in one place so the rest of the
// file is unchanged when the underlying client is Prisma instead of Supabase.
// ---------------------------------------------------------------------------

const toProfileShape = (p: PrismaProfile): Profile => ({
  id: p.id,
  // network_id was dropped (single-network). Kept on the type for back-compat;
  // nothing reads it anymore.
  network_id: 0,
  email: p.email ?? '',
  full_name: p.fullName ?? '',
  nickname: p.nickname ?? '',
  wallet_address: p.walletAddress,
  avatar_url: p.avatarUrl ?? null,
  avatar_key: p.avatarKey ?? null,
  onboarding_completed: p.onboardingCompleted ?? false,
  tutorial_completed: p.tutorialCompleted ?? false,
  crypto_savvy: p.cryptoSavvy ?? false,
  language: p.language ?? null,
  currency: p.currency ?? null,
  created_at: p.createdAt?.toISOString(),
  updated_at: p.updatedAt?.toISOString(),
});

const toAchievementDoc = (a: PrismaAchievement): AchievementDocument => ({
  id: Number(a.id),
  key: a.key as Achievement,
  name: a.name,
  description: a.description,
  tier: a.tier,
  coin_reward: a.coinReward,
  code: a.code,
  hidden: a.hidden,
  refresh_policy: a.refreshPolicy as 'auto' | 'manual',
  cycle_scoped: a.cycleScoped,
  unlock_type: a.unlockType as BadgeUnlockType,
  rule: (a.rule as BadgeRule | null) ?? null,
  icon: a.icon,
  accent: a.accent,
  display_order: a.displayOrder,
  enabled: a.enabled,
  created_at: a.createdAt.toISOString(),
  updated_at: a.updatedAt.toISOString(),
});

/**
 * Lean active-deposit signals for XP / eligibility. Reads deposits by wallet
 * (single-network: `network_id` was dropped) and replicates the
 * `DEPOSIT_SUCCESS` rule from the deposit service without pulling in the full
 * token-network DTO machinery (that lives in the deposit domain).
 *
 * A deposit is "active" (DEPOSIT_SUCCESS) when it is confirmed on-chain
 * (`status='confirmed'` + tx hash + deposit id) and has no withdrawal rows yet.
 */
const getActiveDepositSignalsByWallet = async (
  walletAddress: string,
): Promise<{ amount: number; createdTimestamp: number }[]> => {
  const deposits = await prisma.deposit.findMany({
    where: { walletAddress, deletedAt: null },
    select: {
      amount: true,
      status: true,
      transactionHash: true,
      depositIdHex: true,
      createdAt: true,
      withdrawals: { select: { id: true } },
    },
  });

  return deposits
    .filter(
      (d) =>
        d.status === DepositStatus.CONFIRMED &&
        !!d.transactionHash &&
        !!d.depositIdHex &&
        d.withdrawals.length === 0,
    )
    .map((d) => ({
      amount: Number(d.amount ?? 0),
      createdTimestamp: d.createdAt?.getTime() ?? 0,
    }));
};

export const getProfiles = async () => {
  try {
    const rows = await prisma.profile.findMany({ where: { deletedAt: null } });
    return { data: rows.map(toProfileShape), error: null };
  } catch (error) {
    console.error('Error on getProfiles', error);
    return { data: [] as Profile[], error };
  }
};

export const profilesCacheRef: { current: any | null } = { current: null };

export const getCachedProfiles = async () => {
  // if (profilesCacheRef.current) {
  //   return profilesCacheRef.current;
  // }

  profilesCacheRef.current = await getProfiles();
  return profilesCacheRef.current;
};

/**
 * Current active-deposit sum per wallet, computed on the fly from `deposits`.
 *
 * Replaces the precomputed `profiles_deposits` snapshot table (and the deleted
 * `job-deposits` cron that fed it): instead of reading a stored time series we
 * sum the live "active" deposits — DEPOSIT_SUCCESS (confirmed on-chain with tx
 * hash + deposit id) and not yet withdrawn — grouped by wallet in one query.
 */
export const getActiveDepositSumsByWallet = async (): Promise<{
  sums: Map<string, number>;
  error: unknown;
}> => {
  try {
    const deposits = await prisma.deposit.findMany({
      where: { deletedAt: null, status: DepositStatus.CONFIRMED },
      select: {
        walletAddress: true,
        amount: true,
        transactionHash: true,
        depositIdHex: true,
        withdrawals: { select: { id: true } },
      },
    });

    const sums = new Map<string, number>();
    for (const d of deposits) {
      if (!d.transactionHash || !d.depositIdHex || d.withdrawals.length > 0) {
        continue;
      }
      sums.set(d.walletAddress, (sums.get(d.walletAddress) ?? 0) + Number(d.amount ?? 0));
    }

    return { sums, error: null };
  } catch (error) {
    console.error('Error on getActiveDepositSumsByWallet', error);
    return { sums: new Map<string, number>(), error };
  }
};

export const getRewardByKey = async (rewardKey: Reward) => {
  try {
    const row = await prisma.reward.findFirst({ where: { key: rewardKey } });
    const data: RewardDocument | null = row
      ? {
          id: Number(row.id),
          name: row.name ?? '',
          key: (row.key ?? '') as Reward,
          created_at: row.createdAt.toISOString(),
          updated_at: row.updatedAt.toISOString(),
        }
      : null;
    return { data, error: null };
  } catch (error) {
    console.error('Error on getRewardByKey', error);
    return { data: null as RewardDocument | null, error };
  }
};

/**
 * Resolve the profile for a wallet, creating it on first sight. Single-network:
 * the lookup/insert no longer carries a network_id. `wallet_address` is unique.
 */
export const getProfile = async (walletAddress: string) => {
  try {
    const profile = await prisma.profile.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
    });

    return {
      success: true,
      errorMessage: '',
      errors: [] as unknown,
      profileData: toProfileShape(profile),
    };
  } catch (error) {
    console.error('Error on getProfile', error);
    return {
      success: false,
      errorMessage: 'Failed to resolve profile',
      errors: error,
      profileData: null as Profile | null,
    };
  }
};

export const getRewardsData = async (profileData: Profile) => {

  const { data: rewardData, error } = await getRewardByKey(Reward.GOLD_COIN);

  if (!rewardData) {
    return {
      success: false,
      errorMessage: 'reward not found',
      errors: error,
      rewards: [],
      profileData,
    };
  }

  // Daily reward amounts are admin-configurable (config row), not hard-coded.
  const { dailyGoldCoins, dailyCheckinExperience } = await getRewardsConfig();

  // Pull every reward row for this profile in one read and bucket by reward key
  // — gold coins gate the daily check-in; experience is the persisted check-in XP.
  const profileRewardData = await prisma.profileReward.findMany({
    where: { profileId: profileData.id },
    include: { reward: true },
  });

  const today = getCurrentDay(new Date());
  let goldCollectedToday = 0;
  let goldAmount = 0;
  let experienceAmount = 0;
  // Sum of XP already earned from daily check-ins TODAY — drives the per-day cap
  // so the profile never earns more than the configured amount in a single day.
  let checkinExperienceToday = 0;
  for (const profileReward of profileRewardData) {
    const rewardAmount = Number(profileReward.amount ?? 0);
    const key = profileReward.reward?.key;
    // `reason` is the single source discriminator now (the old `type` column is
    // gone): only daily-checkin rows gate the daily caps; rewards from other
    // events (e.g. achievements) still count toward the totals but never the gate.
    const isDailyCheckinToday =
      profileReward.reason === REWARD_REASON_DAILY_CHECKIN && getCurrentDay(profileReward.createdAt) === today;
    if (key === Reward.GOLD_COIN) {
      goldAmount += rewardAmount;
      if (isDailyCheckinToday) {
        goldCollectedToday += rewardAmount;
      }
    } else if (key === Reward.EXPERIENCE) {
      experienceAmount += rewardAmount;
      if (isDailyCheckinToday) {
        checkinExperienceToday += rewardAmount;
      }
    }
  }

  const goldToCollect = Math.max(dailyGoldCoins - goldCollectedToday, 0);
  // Top-up to the configured daily cap: only what's left to reach it today, so a
  // re-collect (or a mid-day cap increase) never grants the full amount twice.
  const experienceToCollect = Math.max(dailyCheckinExperience - checkinExperienceToday, 0);

  const rewards: RewardResponseDTO[] = [
    {
      key: Reward.GOLD_COIN,
      name: 'Gold Coin',
      amountToCollect: goldToCollect,
      amount: goldAmount,
    },
    {
      key: Reward.EXPERIENCE,
      name: 'Experience',
      amountToCollect: experienceToCollect,
      amount: experienceAmount,
    },
  ];

  return {
    success: true,
    errorMessage: '',
    errors: [],
    rewards,
    profileData,
  };
};

/**
 * Walk a set of check-in day-numbers backwards from today to derive the two
 * streak figures the UI surfaces: `yesterdayStreak` (consecutive completed days
 * ending yesterday) and `todayStreak` (whether today's check-in is done). Shared
 * by the single-profile {@link getStreakData} and the batch
 * {@link getStreakCountsByProfile} so both count a streak identically.
 */
const streakFromDaySet = (
  daysSet: Set<number>,
): { yesterdayStreak: number; todayStreak: boolean } => {
  const todayDay = getCurrentDay(new Date());
  let streak = 0;
  let d = todayDay - 1;

  while (daysSet.has(d)) {
    streak++;
    d--;
  }

  return { yesterdayStreak: streak, todayStreak: daysSet.has(todayDay) };
};

export const getStreakData = async (profileData: Profile) => {
  // A day counts for the streak only if the user collected their daily check-in
  // coin that day — a gold-coin reward stamped with the 'daily-checkin' reason.
  // Confirmed deposits no longer contribute to the streak.
  const profileRewardsData = await prisma.profileReward.findMany({
    where: {
      profileId: profileData.id,
      reason: REWARD_REASON_DAILY_CHECKIN,
      reward: { key: Reward.GOLD_COIN },
    },
    select: { createdAt: true },
  });

  const daysSet = new Set<number>();

  for (const reward of profileRewardsData) {
    daysSet.add(getCurrentDay(new Date(reward.createdAt ?? 0)));
  }

  const { yesterdayStreak, todayStreak } = streakFromDaySet(daysSet);

  return {
    success: true,
    errorMessage: '',
    errors: [],
    yesterdayStreak,
    todayStreak,
    days: Array.from(daysSet),
  };
};

/**
 * Single-query rollup of every profile's current streak for the leaderboard —
 * the batch analogue of {@link getStreakData}. One read of the daily-checkin
 * gold-coin ledger, bucketed into a per-profile day-set, then the same backward
 * walk as the single-profile path. The surfaced number is `yesterdayStreak` plus
 * today's check-in, matching what the streak UI shows. The GROUP BY happens in JS
 * (like {@link getAchievementCountsByProfile}) so the whole leaderboard costs one
 * query instead of an N+1 of per-profile streak reads.
 */
export const getStreakCountsByProfile = async (): Promise<{
  counts: Map<number, number>;
  error: unknown;
}> => {
  const counts = new Map<number, number>();
  try {
    const rows = await prisma.profileReward.findMany({
      where: { reason: REWARD_REASON_DAILY_CHECKIN, reward: { key: Reward.GOLD_COIN } },
      select: { profileId: true, createdAt: true },
    });

    const daysByProfile = new Map<number, Set<number>>();
    for (const row of rows) {
      let daysSet = daysByProfile.get(row.profileId);
      if (!daysSet) {
        daysSet = new Set<number>();
        daysByProfile.set(row.profileId, daysSet);
      }
      daysSet.add(getCurrentDay(new Date(row.createdAt ?? 0)));
    }

    for (const [profileId, daysSet] of daysByProfile) {
      const { yesterdayStreak, todayStreak } = streakFromDaySet(daysSet);
      counts.set(profileId, yesterdayStreak + (todayStreak ? 1 : 0));
    }

    return { counts, error: null };
  } catch (error) {
    console.error('Error on getStreakCountsByProfile', error);
    return { counts, error };
  }
};

export const getMapObjectsAvailableData = async () => {

  const data = await prisma.mapObject.findMany({ where: { deletedAt: null } });

  const objects: ProfileMapObjectsAvailableResponseDTO['objects'] = [];
  for (const { variants, type, prices, freeItems } of data) {
    const objectVariants = (variants || '').split(',').map(Number);
    const objectPrices = String(prices ?? '').split(',').map(Number);
    const objectFreeItems = (freeItems || '').split(',').map(Number);
    for (let i = 0; i < objectVariants.length; i++) {
      const variant = objectVariants[i];
      if (variant != null && variant >= 0 && variant <= 100) {
        objects.push({
          type: (type ?? '') as MapObjectType,
          variant: variant as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
          price: Math.max(objectPrices[i] || 0, 0),
          itemsAvailable: Math.max(objectFreeItems[i] || 0, 0),
        });
      }
    }
  }

  return {
    success: true,
    errorMessage: '',
    errors: [],
    objects,
  };
};

export const toProfileResponseDTO = (networkName: string, profile: Profile): ProfileResponseDTO => {

  return {
    walletAddress: profile?.wallet_address || '',
    networkName,
    email: profile.email ?? '',
    fullName: profile.full_name ?? '',
    nickname: profile.nickname ?? '',
    avatarUrl: profile.avatar_url ?? '',
    onboardingCompleted: profile.onboarding_completed ?? false,
    tutorialCompleted: profile.tutorial_completed ?? false,
    cryptoSavvy: profile.crypto_savvy ?? false,
    language: profile.language ?? '',
    currency: profile.currency ?? '',
    createdAt: profile.created_at ?? '',
  };
};

/**
 * Sum of experience persisted to `profiles_rewards` for this profile — the XP
 * earned from daily check-ins (the `experience` reward, type 'earned'). Lives
 * alongside the deposit-derived XP in {@link toProfileExperienceResponseDTO}.
 */
export const getCheckinExperience = async (profileId: number): Promise<number> => {
  try {
    const rows = await prisma.profileReward.findMany({
      where: { profileId, reward: { key: Reward.EXPERIENCE } },
      select: { amount: true },
    });
    return rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  } catch (error) {
    console.warn('error on getCheckinExperience', error);
    return 0;
  }
};

/**
 * Single-pass rollup of every profile's total XP for the leaderboard — the batch
 * analogue of {@link toProfileExperienceResponseDTO}. Combines the same two
 * sources with one read each: the persisted check-in XP (`experience` reward)
 * keyed by profile, and the deposit-derived XP (`sqrt(amount) * sqrt(hours)`)
 * summed per wallet then folded onto the owning profile. Avoids the per-profile
 * N+1 the single-profile endpoint would incur across the whole leaderboard.
 */
export const getExperienceByProfile = async (
  profiles: Profile[],
): Promise<{ experience: Map<number, number>; error: unknown }> => {
  const experience = new Map<number, number>();
  try {
    // Check-in XP: sum every persisted `experience` reward amount per profile.
    const xpRows = await prisma.profileReward.findMany({
      where: { reward: { key: Reward.EXPERIENCE } },
      select: { profileId: true, amount: true },
    });
    for (const row of xpRows) {
      experience.set(row.profileId, (experience.get(row.profileId) ?? 0) + Number(row.amount ?? 0));
    }

    // Deposit-derived XP: identical formula to the single-profile path, summed
    // per wallet from the live active deposits (confirmed on-chain, not withdrawn).
    const deposits = await prisma.deposit.findMany({
      where: { deletedAt: null, status: DepositStatus.CONFIRMED },
      select: {
        walletAddress: true,
        amount: true,
        transactionHash: true,
        depositIdHex: true,
        createdAt: true,
        withdrawals: { select: { id: true } },
      },
    });
    const now = Date.now();
    const depositXpByWallet = new Map<string, number>();
    for (const d of deposits) {
      if (!d.transactionHash || !d.depositIdHex || d.withdrawals.length > 0) {
        continue;
      }
      const timeElapsed = Math.max(now - (d.createdAt?.getTime() ?? 0), 0);
      const xp = Math.sqrt(Number(d.amount ?? 0)) * Math.sqrt(timeElapsed / (1000 * 60 * 60));
      depositXpByWallet.set(d.walletAddress, (depositXpByWallet.get(d.walletAddress) ?? 0) + xp);
    }

    for (const profile of profiles) {
      const depositXp = depositXpByWallet.get(profile.wallet_address ?? '');
      if (depositXp) {
        experience.set(profile.id, (experience.get(profile.id) ?? 0) + depositXp);
      }
    }

    return { experience, error: null };
  } catch (error) {
    console.error('Error on getExperienceByProfile', error);
    return { experience, error };
  }
};

export const toProfileExperienceResponseDTO = async (networkName: string, profile: Profile): Promise<ProfileExperienceResponseDTO> => {
  let experience = 0;
  try {
    const deposits = await getActiveDepositSignalsByWallet(profile.wallet_address);
    for (const deposit of deposits) {
      const timeElapsed = Math.max(Date.now() - deposit.createdTimestamp, 0);
      experience += Math.sqrt(deposit.amount || 0) * Math.sqrt(timeElapsed / (1000 * 60 * 60));
    }
  } catch (error) {
    console.warn('error on toProfileExperienceResponseDTO', error);
  }

  // Add the experience persisted from daily check-ins (the deposit formula above
  // is unchanged — this is an additional, ledgered source of XP).
  experience += await getCheckinExperience(profile.id);

  return {
    walletAddress: profile?.wallet_address || '',
    networkName,
    experience,
  };
};

export const toProfileRewardsResponseDTO = async (networkName: string, profile: Profile): Promise<ProfileRewardsResponseDTO> => {

  const { rewards } = await getRewardsData(profile);

  return {
    walletAddress: profile?.wallet_address || '',
    networkName,
    rewards: rewards.map(reward => ({ name: reward.name, amount: reward.amount })),
  };
};

export const toProfileStreakResponseDTO = async (networkName: string, profile: Profile): Promise<ProfileStreakResponseDTO> => {

  const { todayStreak, yesterdayStreak, days } = await getStreakData(profile);

  return {
    walletAddress: profile?.wallet_address || '',
    networkName,
    todayStreak,
    yesterdayStreak,
    days,
  };
};

const toMapObjects = (objects: any): MapObject[] => {
  if (Array.isArray(objects)) {
    return objects.map(object => ({
      position: [ object?.position?.[0] || 0, object?.position?.[1] || 0, object?.position?.[2] || 0 ],
      type: object?.type || MapObjectType.EMPTY,
      variant: object?.variant || 0,
      rotation: [ object?.rotation?.[0] || 0, object?.rotation?.[1] || 0, object?.rotation?.[2] || 0 ],
    }));
  }
  return [];
};
export const getProfileMapObjects = async (profile: Profile) => {
  const existing = await prisma.profileMapObject.findFirst({
    where: { profileId: profile.id },
  });
  if (existing) {
    return {
      success: true,
      errorMessage: '',
      errors: [],
      profileMapObjects: {
        id: existing.id,
        objects: toMapObjects(existing.objects ?? []),
      },
    };
  }

  const created = await prisma.profileMapObject.create({
    data: {
      profileId: profile.id,
      objects: friendlyStandardMap as object,
    },
  });

  return {
    success: true,
    errorMessage: '',
    errors: [],
    profileMapObjects: {
      id: created.id,
      objects: toMapObjects(created.objects ?? []),
    },
  };
};

export const toProfileMapObjectsResponseDTO = async (networkName: string, profile: Profile): Promise<ProfileMapObjectsResponseDTO> => {

  const { profileMapObjects } = await getProfileMapObjects(profile);

  return {
    walletAddress: profile?.wallet_address || '',
    networkName,
    objects: profileMapObjects?.objects || [],
  };
};

export const toProfileMapObjectsAvailableResponseDTO = async (networkName: string, profile: Profile): Promise<ProfileMapObjectsAvailableResponseDTO> => {

  const { objects } = await getMapObjectsAvailableData();

  return {
    walletAddress: profile?.wallet_address || '',
    networkName,
    objects,
  };
};

export const broadcastProfileChange = async (message: string, keys: string[]) => {
  const channel = ably.channels.get('profiles-changes');
  console.info('broadcastProfileChange:', message);
  await channel.publish('change', {
    message,
    keys,
    timestamp: Date.now(),
  });
};

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export const getAchievementByKey = async (key: Achievement | string) => {
  try {
    const row = await prisma.achievement.findFirst({ where: { key, deletedAt: null } });
    return { data: row ? toAchievementDoc(row) : null, error: null };
  } catch (error) {
    console.error('Error on getAchievementByKey', error);
    return { data: null as AchievementDocument | null, error };
  }
};

/** Fields the admin panel may write on an achievement. snake_case to match the
 *  DB columns; all optional so PATCH can send a partial. */
export interface AchievementWriteFields {
  name: string;
  description: string;
  tier: string;
  coin_reward: number;
  unlock_type: BadgeUnlockType;
  rule: BadgeRule | null;
  icon: string | null;
  accent: string | null;
  code: string | null;
  hidden: boolean;
  cycle_scoped: boolean;
  refresh_policy: 'auto' | 'manual';
  display_order: number;
  enabled: boolean;
}

/** Map the admin panel's snake_case write fields onto Prisma's camelCase columns.
 *  Only keys present in `input` are emitted, so PATCH can send a partial. */
const achievementWriteToPrisma = (
  input: Partial<AchievementWriteFields>,
): Prisma.AchievementUncheckedUpdateInput => {
  const data: Prisma.AchievementUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.tier !== undefined) data.tier = input.tier;
  if (input.coin_reward !== undefined) data.coinReward = input.coin_reward;
  if (input.unlock_type !== undefined) data.unlockType = input.unlock_type;
  if (input.rule !== undefined)
    data.rule = input.rule === null ? Prisma.DbNull : (input.rule as unknown as Prisma.InputJsonValue);
  if (input.icon !== undefined) data.icon = input.icon;
  if (input.accent !== undefined) data.accent = input.accent;
  if (input.code !== undefined) data.code = input.code;
  if (input.hidden !== undefined) data.hidden = input.hidden;
  if (input.cycle_scoped !== undefined) data.cycleScoped = input.cycle_scoped;
  if (input.refresh_policy !== undefined) data.refreshPolicy = input.refresh_policy;
  if (input.display_order !== undefined) data.displayOrder = input.display_order;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  return data;
};

/** Insert a new achievement (admin). `key` is immutable once created. */
export const createAchievement = async (
  input: Partial<AchievementWriteFields> & { key: string },
) => {
  try {
    const { key, ...rest } = input;
    const row = await prisma.achievement.create({
      data: { key, ...achievementWriteToPrisma(rest) } as Prisma.AchievementUncheckedCreateInput,
    });
    return { data: toAchievementDoc(row), error: null };
  } catch (error) {
    console.error('Error on createAchievement', error);
    return { data: null as AchievementDocument | null, error };
  }
};

/** Patch an existing achievement by key (admin). We never change `key`. */
export const updateAchievement = async (
  key: string,
  patch: Partial<AchievementWriteFields>,
) => {
  try {
    const row = await prisma.achievement.update({
      where: { key },
      data: achievementWriteToPrisma(patch),
    });
    return { data: toAchievementDoc(row), error: null };
  } catch (error) {
    console.error('Error on updateAchievement', error);
    return { data: null as AchievementDocument | null, error };
  }
};

export const getAllAchievements = async () => {
  try {
    const rows = await prisma.achievement.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
    });
    return { data: rows.map(toAchievementDoc), error: null };
  } catch (error) {
    console.error('Error on getAllAchievements', error);
    return { data: [] as AchievementDocument[], error };
  }
};

/**
 * Public, user-agnostic badge catalog for the web app to render instead of a
 * hardcoded list. Returns only `enabled`, non-`hidden` badges, ordered by
 * `display_order`. Secret (redeem-code) badges stay out of the public catalog
 * until the user claims them — same rule as {@link toProfileAchievementsResponseDTO}.
 */
export const toCatalogAchievementsResponseDTO = async (): Promise<CatalogAchievementResponseDTO[]> => {
  const { data } = await getAllAchievements();
  return data
    .filter((a) => a.enabled !== false && !a.hidden)
    .sort((x, y) => (x.display_order ?? 0) - (y.display_order ?? 0))
    .map((a) => ({
      key: a.key,
      name: a.name,
      description: a.description,
      tier: a.tier,
      coinReward: a.coin_reward,
      icon: a.icon ?? null,
      accent: a.accent ?? null,
      unlockType: a.unlock_type,
      displayOrder: a.display_order ?? 0,
    }));
};

export const getClaimedAchievements = async (profileId: number) => {
  try {
    const rows = await prisma.profileAchievement.findMany({
      where: { profileId },
      include: { achievement: true },
    });
    const data: ProfileAchievement[] = rows.map((row) => ({
      id: Number(row.id),
      profile_id: row.profileId,
      achievement_id: Number(row.achievementId),
      claimed_at: row.claimedAt.toISOString(),
      ...(row.achievement ? { achievements: toAchievementDoc(row.achievement) } : {}),
    }));
    return { data, error: null };
  } catch (error) {
    console.error('Error on getClaimedAchievements', error);
    return { data: [] as ProfileAchievement[], error };
  }
};

/**
 * Single-query rollup of how many achievements each profile has claimed.
 * The payload is just `profile_id` per row (no joins), so even thousands of
 * claims is a tiny network read; the GROUP BY happens in JS to avoid needing
 * a Postgres view / RPC for what is effectively a counter.
 */
export const getAchievementCountsByProfile = async (): Promise<{
  counts: Map<number, number>;
  error: unknown;
}> => {
  const counts = new Map<number, number>();
  try {
    const rows = await prisma.profileAchievement.findMany({ select: { profileId: true } });
    for (const row of rows) {
      counts.set(row.profileId, (counts.get(row.profileId) ?? 0) + 1);
    }
    return { counts, error: null };
  } catch (error) {
    console.error('Error on getAchievementCountsByProfile', error);
    return { counts, error };
  }
};

/**
 * Inserts the ledger row + the matching gold-coin credit in a single Postgres
 * transaction via the `claim_achievement` PL/pgSQL function. The UNIQUE
 * constraint on (profile_id, achievement_id) surfaces a repeat claim as error
 * code 23505 (`unique_violation`), which we flag back to the caller via
 * `alreadyClaimed` so the API layer can turn it into a 409.
 */
export const claimAchievement = async (profileId: number, key: Achievement) => {
  try {
    const rows = await prisma.$queryRaw<
      { achievement_id: bigint; coin_reward: number; claimed_at: Date }[]
    >`SELECT * FROM claim_achievement(${profileId}::bigint, ${key}::text)`;

    const row = rows[0];
    return {
      success: true as const,
      achievementId: Number(row?.achievement_id ?? 0),
      coinReward: Number(row?.coin_reward ?? 0),
      claimedAt: (row?.claimed_at ?? new Date()).toISOString(),
    };
  } catch (error) {
    // Prisma surfaces the Postgres error code on the raw-query error; 23505 is
    // the UNIQUE (profile_id, achievement_id) violation = already claimed.
    const code =
      (error as { meta?: { code?: string }; code?: string })?.meta?.code ??
      (error as { code?: string })?.code;
    const alreadyClaimed = code === '23505' || /23505/.test(String((error as Error)?.message ?? ''));
    return { success: false as const, alreadyClaimed, error };
  }
};

/**
 * Pre-computed snapshot of every signal the achievement eligibility table
 * needs. Built once per request via {@link computeEligibilitySignals} so the
 * GET catalog and the POST claim route share a single set of DB roundtrips.
 *
 * Fields that depend on systems we haven't built yet (friends, leaderboard)
 * default to safe values — eligibility for those achievements stays `false`
 * until the underlying signals exist.
 */
export interface EligibilitySignals {
  /** Profile creation date. `null` when missing (treated as ineligible for Beta Tester). */
  createdAt: Date | null;
  /** Lifetime XP using the same formula as toProfileExperienceResponseDTO. */
  experience: number;
  /** Consecutive days saving — `yesterdayStreak + (todayStreak ? 1 : 0)`. */
  streakCount: number;
  /** Number of deposits currently in DEPOSIT_SUCCESS state. */
  activeDeposits: number;
  /** Sum of amounts (display units, e.g. USDC dollars) across active deposits. */
  activeAmount: number;
  /** Number of profiles this user follows (from the `follows` graph). */
  friendsCount: number;
  /** 1-based monthly leaderboard rank. TODO: wire when leaderboard data exists. */
  leaderboardRank?: number;
}

/**
 * Gather every signal the eligibility table needs, in one go, from the
 * existing helpers. Deposit + experience math mirrors what
 * {@link toProfileExperienceResponseDTO} already does so the numbers line up
 * with the rest of the API.
 */
export const computeEligibilitySignals = async (
  profile: Profile,
): Promise<EligibilitySignals> => {
  let activeDeposits = 0;
  let activeAmount = 0;
  let experience = 0;
  try {
    const deposits = await getActiveDepositSignalsByWallet(profile.wallet_address);
    for (const deposit of deposits) {
      activeDeposits++;
      activeAmount += deposit.amount || 0;
      const timeElapsed = Math.max(Date.now() - deposit.createdTimestamp, 0);
      experience += Math.sqrt(deposit.amount || 0) * Math.sqrt(timeElapsed / (1000 * 60 * 60));
    }
  } catch (error) {
    console.warn('[eligibility] failed to load deposits', error);
  }

  let streakCount = 0;
  try {
    const streak = await getStreakData(profile);
    streakCount = streak.yesterdayStreak + (streak.todayStreak ? 1 : 0);
  } catch (error) {
    console.warn('[eligibility] failed to load streak', error);
  }

  // Number of profiles this user follows — drives the FIRST_FRIEND badge.
  // Queried inline (not via the follows service) to avoid a circular import.
  let friendsCount = 0;
  try {
    friendsCount = await prisma.follow.count({ where: { followerId: profile.id } });
  } catch (error) {
    console.warn('[eligibility] failed to load friends count', error);
  }

  const createdAt = profile.created_at ? new Date(profile.created_at) : null;

  return {
    createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
    experience,
    streakCount,
    activeDeposits,
    activeAmount,
    friendsCount,
  };
};

/**
 * Whether a badge is unlocked by the *live signals* alone, driven by the
 * badge's configurable `rule` (see {@link evaluateRule}). Stateless — pass the
 * result of {@link computeEligibilitySignals} as `signals`.
 *
 * Only `unlock_type === 'rule'` badges are signal-driven. `cycle_rank`
 * (leaderboard) eligibility needs cycle context and is verified in the claim
 * route; `redeem_code` / `manual` are claim-driven and never auto-unlock from
 * signals — so they return `false` here.
 */
export const isAchievementEligible = (
  achievement: AchievementDocument,
  signals: EligibilitySignals,
): boolean => {
  if (achievement.unlock_type !== 'rule') return false;
  return evaluateRule(achievement.rule, signals);
};

export const toProfileAchievementsResponseDTO = async (
  networkName: string,
  profile: Profile,
): Promise<ProfileAchievementsResponseDTO> => {
  // One set of DB calls feeds both the catalog AND the per-row eligibility
  // computation below. computeEligibilitySignals reuses the deposit-signals
  // helper so this isn't free, but it's bounded — a small handful of queries.
  const [allRes, claimedRes, signals, minted] = await Promise.all([
    getAllAchievements(),
    getClaimedAchievements(profile.id),
    computeEligibilitySignals(profile),
    getMintedBadges(profile.wallet_address),
  ]);

  const claimedById = new Map<number, ProfileAchievement>(
    claimedRes.data.map((row) => [row.achievement_id, row]),
  );

  // On-chain mints are keyed by badge_type, which equals the achievement key.
  // Keep the tx hash alongside so clients can link an already-minted badge to
  // its stellar.expert transaction without triggering a re-mint.
  const mintedByKey = new Map(minted.map((m) => [m.badge_type, m.transaction_hash]));

  const achievements: AchievementResponseDTO[] = allRes.data
    // Hide secret achievements until the user actually claims them — the
    // catalog endpoint must not leak the existence of redeem-code badges.
    .filter((a) => !a.hidden || claimedById.has(a.id))
    .map((a) => {
      const claim = claimedById.get(a.id);
      return {
        key: a.key as Achievement,
        name: a.name,
        description: a.description,
        tier: a.tier,
        coinReward: a.coin_reward,
        // `unlocked` is true if eligibility OR claim — claim implies the user
        // was eligible at the time, so flipping it to true here keeps the tile
        // showing as "earned" even if the eligibility rule later tightens.
        unlocked: !!claim || isAchievementEligible(a, signals),
        claimedAt: claim?.claimed_at ?? null,
        minted: mintedByKey.has(a.key),
        // Empty string from getMintedBadges (unconfirmed/missing) normalizes to null.
        transactionHash: mintedByKey.get(a.key) || null,
        icon: a.icon ?? null,
        accent: a.accent ?? null,
        displayOrder: a.display_order ?? 0,
      };
    });

  return {
    walletAddress: profile?.wallet_address || '',
    networkName,
    achievements,
  };
};

// ---------------------------------------------------------------------------
// Redeem codes
// ---------------------------------------------------------------------------

export const getAchievementByCode = async (code: string) => {
  try {
    const row = await prisma.achievement.findFirst({ where: { code, deletedAt: null } });
    return { data: row ? toAchievementDoc(row) : null, error: null };
  } catch (error) {
    console.error('Error on getAchievementByCode', error);
    return { data: null as AchievementDocument | null, error };
  }
};

/**
 * Redeem a code to claim its achievement for the given profile.
 *
 * Resolution order:
 *   1. Look up the achievement by code (404 if not found).
 *   2. Call `claimAchievement` — UNIQUE (profile_id, achievement_id) prevents
 *      double-claim and surfaces as 23505, mapped to `alreadyClaimed`.
 *
 * The function is intentionally agnostic about hidden vs visible — any
 * achievement with a non-null `code` is redeemable, regardless of `hidden`.
 * The `hidden` flag only governs catalog visibility (see
 * `toProfileAchievementsResponseDTO`).
 */
export const redeemAchievementCode = async (profileId: number, code: string) => {
  const { data: achievement, error: lookupError } = await getAchievementByCode(code);

  if (lookupError) {
    return { success: false as const, notFound: false, alreadyClaimed: false, error: lookupError };
  }
  if (!achievement) {
    return { success: false as const, notFound: true, alreadyClaimed: false, error: null };
  }

  const claim = await claimAchievement(profileId, achievement.key);

  if (!claim.success) {
    return {
      success: false as const,
      notFound: false,
      alreadyClaimed: claim.alreadyClaimed,
      error: claim.error,
    };
  }

  return {
    success: true as const,
    achievementKey: achievement.key,
    achievementId: claim.achievementId,
    coinReward: claim.coinReward,
    claimedAt: claim.claimedAt,
  };
};

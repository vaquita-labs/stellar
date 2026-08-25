import { resolveAvatarConfig } from '@vaquita/avatar';
import { Prisma, prisma } from '@vaquita/db';
import type { Achievement as PrismaAchievement, Profile as PrismaProfile } from '@vaquita/db';
import { getCurrentDay } from '../../helpers/date';
import { ably } from '../ably';
import { getActiveBadgeClaimsForWallet, getMintedBadges } from '../badges/claims';
import { getLastClosedCycleId, getLeaderboardRankForWallet } from '../leaderboard';
import { notify } from '../notifications';
import {
  Achievement,
  type AchievementDocument,
  type AchievementResponseDTO,
  type BadgeRule,
  type BadgeUnlockType,
  type CatalogAchievementResponseDTO,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DepositStatus,
  type MapObject,
  MapObjectType,
  type NotificationPreferences,
  type Profile,
  type ProfileAchievement,
  type ProfileAchievementsResponseDTO,
  type ProfileExperienceResponseDTO,
  type ProfileMapObjectsAvailableResponseDTO,
  type ProfileMapObjectsResponseDTO,
  type ProfileResponseDTO,
  type ProfileRewardsResponseDTO,
  type ProfileStreakResponseDTO,
  type PurchaseMapItemResponseDTO,
  Reward,
  type RewardDocument,
  type RewardResponseDTO,
} from '../../types';
import { getRewardsConfig } from '../project-config';
import { REWARD_REASON_DAILY_CHECKIN, REWARD_REASON_SHOP_PURCHASE } from './constants';
import { friendlyStandardMap, mapTemplateInventory } from './map-template';
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
  avatar_config: p.avatarConfig ?? null,
  onboarding_completed: p.onboardingCompleted ?? false,
  tutorial_completed: p.tutorialCompleted ?? false,
  crypto_savvy: p.cryptoSavvy ?? false,
  language: p.language ?? null,
  currency: p.currency ?? null,
  notification_preferences: (p.notificationPreferences as Partial<NotificationPreferences> | null) ?? null,
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
  xp_reward: a.xpReward,
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
 * XP a deposit has generated: `sqrt(amount) * sqrt(hours the money was working)`.
 *
 * `endTimestamp` is what makes XP monotonic. While a deposit is active it is
 * `now`, so XP keeps growing. Once withdrawn it freezes at the withdrawal
 * instant instead of dropping to zero — the XP the money earned while it was
 * committed stays earned, it just stops accruing. Without this, withdrawing
 * silently deleted XP and could re-lock an already-earned badge.
 */
export const depositExperience = (
  amount: number,
  createdTimestamp: number,
  endTimestamp: number,
): number => {
  const timeElapsed = Math.max(endTimestamp - createdTimestamp, 0);
  return Math.sqrt(amount || 0) * Math.sqrt(timeElapsed / (1000 * 60 * 60));
};

/** When a deposit stopped accruing XP: its first withdrawal, or `null` if still active. */
const withdrawnAt = (withdrawals: { createdAt: Date | null }[]): number | null => {
  if (withdrawals.length === 0) return null;
  const stamps = withdrawals.map((w) => w.createdAt?.getTime() ?? 0).filter((t) => t > 0);
  return stamps.length > 0 ? Math.min(...stamps) : null;
};

/**
 * Deposit signals for XP / eligibility. Reads deposits by wallet (single-network:
 * `network_id` was dropped) and replicates the `DEPOSIT_SUCCESS` rule from the
 * deposit service without pulling in the full token-network DTO machinery (that
 * lives in the deposit domain).
 *
 * A deposit counts as confirmed on-chain when `status='confirmed'` with a tx hash
 * and deposit id. `active` distinguishes "still in the vault" (no withdrawal) from
 * "withdrawn" — active drives balance-style signals, while *every* confirmed
 * deposit contributes XP (frozen at withdrawal for the withdrawn ones).
 */
const getDepositSignalsByWallet = async (
  walletAddress: string,
): Promise<{ amount: number; createdTimestamp: number; endTimestamp: number; active: boolean }[]> => {
  const deposits = await prisma.deposit.findMany({
    where: { walletAddress, deletedAt: null },
    select: {
      amount: true,
      status: true,
      transactionHash: true,
      depositIdHex: true,
      createdAt: true,
      withdrawals: { select: { createdAt: true } },
    },
  });

  const now = Date.now();
  return deposits
    .filter(
      (d) => d.status === DepositStatus.CONFIRMED && !!d.transactionHash && !!d.depositIdHex,
    )
    .map((d) => {
      const closedAt = withdrawnAt(d.withdrawals);
      return {
        amount: Number(d.amount ?? 0),
        createdTimestamp: d.createdAt?.getTime() ?? 0,
        endTimestamp: closedAt ?? now,
        active: closedAt === null,
      };
    });
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

/**
 * Resolve a profile by its public username (nickname). Read-only — never
 * creates. Case-insensitive because old rows predate the lowercase-on-save
 * rule. Returns `profileData: null` when no live profile owns the nickname.
 */
export const getProfileByNickname = async (nickname: string) => {
  try {
    const profile = await prisma.profile.findFirst({
      where: { nickname: { equals: nickname, mode: 'insensitive' }, deletedAt: null },
    });

    return {
      success: true,
      errorMessage: '',
      errors: [] as unknown,
      profileData: profile ? toProfileShape(profile) : null,
    };
  } catch (error) {
    console.error('Error on getProfileByNickname', error);
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
          // El inventario por perfil se suma en toProfileMapObjectsAvailableResponseDTO.
          owned: 0,
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

/**
 * `legalAcceptedVersion` is passed in rather than read here: the mapper is
 * synchronous and is also used to map a whole list of profiles, where a
 * per-row acceptance lookup would be an N+1. The single-profile endpoints the
 * acceptance gate reads pass the real value; list endpoints leave it ''.
 */
export const toProfileResponseDTO = (
  networkName: string,
  profile: Profile,
  legalAcceptedVersion = '',
): ProfileResponseDTO => {

  // Defaults merged under whatever the user saved (the column may be NULL or
  // partial). The email channel requires an email address on the profile, so a
  // stale `email: true` reads as off after the address is removed.
  const notificationPreferences: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(profile.notification_preferences ?? {}),
  };
  notificationPreferences.email = notificationPreferences.email && !!profile.email;

  return {
    walletAddress: profile?.wallet_address || '',
    networkName,
    email: profile.email ?? '',
    fullName: profile.full_name ?? '',
    nickname: profile.nickname ?? '',
    avatarConfig: resolveAvatarConfig(profile.avatar_config, profile.wallet_address),
    onboardingCompleted: profile.onboarding_completed ?? false,
    tutorialCompleted: profile.tutorial_completed ?? false,
    cryptoSavvy: profile.crypto_savvy ?? false,
    legalAcceptedVersion,
    language: profile.language ?? '',
    currency: profile.currency ?? '',
    notificationPreferences,
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
    // per wallet. Withdrawn deposits still count — their XP is frozen at the
    // withdrawal instant (see {@link depositExperience}) rather than dropped, so
    // leaderboard XP is monotonic just like the profile endpoint.
    const deposits = await prisma.deposit.findMany({
      where: { deletedAt: null, status: DepositStatus.CONFIRMED },
      select: {
        walletAddress: true,
        amount: true,
        transactionHash: true,
        depositIdHex: true,
        createdAt: true,
        withdrawals: { select: { createdAt: true } },
      },
    });
    const now = Date.now();
    const depositXpByWallet = new Map<string, number>();
    for (const d of deposits) {
      if (!d.transactionHash || !d.depositIdHex) {
        continue;
      }
      const xp = depositExperience(
        Number(d.amount ?? 0),
        d.createdAt?.getTime() ?? 0,
        withdrawnAt(d.withdrawals) ?? now,
      );
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
    const deposits = await getDepositSignalsByWallet(profile.wallet_address);
    for (const deposit of deposits) {
      experience += depositExperience(deposit.amount, deposit.createdTimestamp, deposit.endTimestamp);
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

  // Cada objeto del template queda respaldado en el inventario del perfil,
  // así quitarlo del mapa lo devuelve a su colección (los objetos del mapa
  // son bienes del usuario, no decorado descartable).
  try {
    await prisma.profileMapItem.createMany({
      data: mapTemplateInventory().map((item) => ({ profileId: profile.id, ...item })),
      skipDuplicates: true,
    });
  } catch (error) {
    // El mapa ya se creó; sin respaldo el usuario solo pierde el retorno a
    // colección de lo inicial. No bloquea la creación del perfil.
    console.error('Error seeding map template inventory', error);
  }

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

  // Inventario del usuario: lo comprado/otorgado se suma a los freeItems
  // globales del catálogo para formar lo colocable.
  const ownedRows = await prisma.profileMapItem.findMany({ where: { profileId: profile.id } });
  const ownedByItem = new Map<string, number>();
  for (const row of ownedRows) {
    ownedByItem.set(`${row.type}|${row.variant}`, row.quantity);
  }

  const merged = objects.map((object) => {
    const key = `${object.type}|${object.variant}`;
    const owned = ownedByItem.get(key) ?? 0;
    ownedByItem.delete(key);
    return { ...object, owned, itemsAvailable: object.itemsAvailable + owned };
  });

  // Ítems del inventario que no están (o ya no están) en el catálogo — p. ej.
  // el kit inicial o regalos retirados de la venta. No son comprables
  // (price 0) pero sí colocables, y al quitarlos del mapa vuelven acá.
  for (const [key, owned] of ownedByItem) {
    if (owned <= 0) continue;
    const [type, variant] = key.split('|');
    merged.push({
      type: type as MapObjectType,
      variant: Number(variant) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      price: 0,
      itemsAvailable: owned,
      owned,
    });
  }

  return {
    walletAddress: profile?.wallet_address || '',
    networkName,
    objects: merged,
  };
};

/**
 * Compra de un ítem del catálogo de mapa: valida el precio contra el catálogo
 * global (map_objects) y el saldo de monedas contra el ledger, y en una
 * transacción registra el gasto (fila negativa de Gold Coin, reason
 * 'shop-purchase') e incrementa el inventario del perfil.
 */
export const purchaseMapItem = async (
  profileData: Profile,
  type: MapObjectType,
  variant: number,
  quantity: number,
): Promise<{ success: boolean; errorMessage: string; status: number; purchase?: PurchaseMapItemResponseDTO }> => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return { success: false, errorMessage: 'Invalid quantity', status: 400 };
  }

  const { objects } = await getMapObjectsAvailableData();
  const catalogItem = objects.find((object) => object.type === type && object.variant === variant);
  if (!catalogItem) {
    return { success: false, errorMessage: 'Item not found in catalog', status: 404 };
  }
  if (catalogItem.price <= 0) {
    return { success: false, errorMessage: 'Item is not for sale', status: 400 };
  }

  const totalPrice = catalogItem.price * quantity;

  const rewardsResponse = await getRewardsData(profileData);
  if (!rewardsResponse.success) {
    return { success: false, errorMessage: 'Could not resolve gold balance', status: 500 };
  }
  const goldBalance = rewardsResponse.rewards.find((reward) => reward.key === Reward.GOLD_COIN)?.amount ?? 0;
  if (goldBalance < totalPrice) {
    return { success: false, errorMessage: 'Not enough gold coins', status: 400 };
  }

  const { data: goldReward, error: goldRewardError } = await getRewardByKey(Reward.GOLD_COIN);
  if (goldRewardError || !goldReward) {
    return { success: false, errorMessage: 'Gold coin reward not configured', status: 500 };
  }

  // Atómico: el gasto y el ítem se registran juntos. (El chequeo de saldo de
  // arriba no es serializable con compras concurrentes; para el volumen actual
  // un sobregiro puntual es aceptable y quedaría auditado en el ledger.)
  const [, itemRow] = await prisma.$transaction([
    prisma.profileReward.create({
      data: {
        profileId: profileData.id,
        rewardId: BigInt(goldReward.id),
        amount: -totalPrice,
        reason: REWARD_REASON_SHOP_PURCHASE,
      },
    }),
    prisma.profileMapItem.upsert({
      where: { profileId_type_variant: { profileId: profileData.id, type, variant } },
      create: { profileId: profileData.id, type, variant, quantity },
      update: { quantity: { increment: quantity } },
    }),
  ]);

  return {
    success: true,
    errorMessage: '',
    status: 200,
    purchase: {
      type,
      variant,
      quantity,
      owned: itemRow.quantity,
      goldBalance: goldBalance - totalPrice,
    },
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
 *  DB columns; all optional so PATCH can send a partial. The writes themselves
 *  live in the admin app's own route handlers (apps/admin/src/app/api/admin/
 *  achievements); this type is the shared contract they map from. */
export interface AchievementWriteFields {
  name: string;
  description: string;
  tier: string;
  coin_reward: number;
  xp_reward: number;
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

const toCatalogAchievementDTO = (a: AchievementDocument): CatalogAchievementResponseDTO => ({
  key: a.key,
  name: a.name,
  description: a.description,
  tier: a.tier,
  coinReward: a.coin_reward,
  icon: a.icon ?? null,
  accent: a.accent ?? null,
  unlockType: a.unlock_type,
  displayOrder: a.display_order ?? 0,
});

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
    .map(toCatalogAchievementDTO);
};

/**
 * Single-badge lookup by key, used to render share/OG cards for a badge the
 * caller already knows the id of.
 *
 * Unlike {@link toCatalogAchievementsResponseDTO} this DOES resolve `hidden`
 * badges. Hiding them from the list keeps redeem-code badges unenumerable —
 * the property worth protecting — but a by-key lookup leaks nothing extra:
 * the caller had to know the exact key, which it only gets from having earned
 * the badge or from a share link someone published. Withholding them here just
 * 404s the OG endpoint, which is what broke image download and link unfurls
 * for every secret badge.
 *
 * Disabled (`enabled = false`) badges stay out: a retired badge should not
 * mint fresh share cards.
 */
export const toCatalogAchievementByKeyResponseDTO = async (
  key: string,
): Promise<CatalogAchievementResponseDTO | null> => {
  const { data } = await getAchievementByKey(key);
  if (!data || data.enabled === false) return null;
  return toCatalogAchievementDTO(data);
};

/**
 * When a given profile claimed a given badge, or null if it never did.
 *
 * The share card prints "earned by @nickname" over an unlock date. Both used to
 * come from the query string, so the rendered image could assert a claim that
 * never happened. This is the record that makes the claim checkable: the
 * renderer resolves the pair and takes the date from here, and a pair with no
 * row renders nothing at all.
 *
 * Matching is case-insensitive because the nickname arrives from a URL; the
 * format check already restricts stored values to lowercase.
 */
export const getBadgeClaimForNickname = async (
  achievementKey: string,
  nickname: string,
): Promise<{ nickname: string; claimedAt: string } | null> => {
  try {
    const row = await prisma.profileAchievement.findFirst({
      where: {
        achievement: { key: achievementKey, deletedAt: null },
        profile: { nickname: { equals: nickname, mode: 'insensitive' }, deletedAt: null },
      },
      select: { claimedAt: true, profile: { select: { nickname: true } } },
    });
    if (!row?.profile?.nickname) return null;
    return { nickname: row.profile.nickname, claimedAt: row.claimedAt.toISOString() };
  } catch (error) {
    console.error('Error on getBadgeClaimForNickname', error);
    return null;
  }
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
 * Single-query rollup of each profile's gold-coin balance, mirroring what the
 * profile endpoint reports for a single wallet: the sum of every Gold Coin
 * ledger row, spends included (purchases are stored as negative amounts).
 */
export const getCoinsByProfile = async (): Promise<{
  counts: Map<number, number>;
  error: unknown;
}> => {
  const counts = new Map<number, number>();
  try {
    const rows = await prisma.profileReward.findMany({
      where: { reward: { key: Reward.GOLD_COIN } },
      select: { profileId: true, amount: true },
    });
    for (const row of rows) {
      counts.set(row.profileId, (counts.get(row.profileId) ?? 0) + Number(row.amount ?? 0));
    }
    return { counts, error: null };
  } catch (error) {
    console.error('Error on getCoinsByProfile', error);
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
    // Finalize the off-chain claim entirely in Prisma: insert the claim row and,
    // if the badge carries coins, credit the gold-coin reward — atomically.
    //
    // This used to delegate to the `claim_achievement` Postgres function, but
    // that function is a hand-applied migration artifact that was missing on some
    // deployments, so every claim failed silently (no claimed_at, no coins) and
    // the mint/reconcile flows could never finalize. Owning the logic here
    // removes that hidden DB dependency — it works on any DB with the schema.
    const { achievementId, coinReward, xpReward, claimedAt } = await prisma.$transaction(async (tx) => {
      const achievement = await tx.achievement.findFirst({
        where: { key },
        select: { id: true, coinReward: true, xpReward: true },
      });
      if (!achievement) {
        throw new Error(`Unknown achievement key: ${key}`);
      }

      const now = new Date();
      // The @@unique(profileId, achievementId) turns a repeat claim into a P2002,
      // surfaced as `alreadyClaimed` in the catch below.
      await tx.profileAchievement.create({
        data: { profileId, achievementId: achievement.id, claimedAt: now },
      });

      if (achievement.coinReward > 0) {
        const gold = await tx.reward.findFirst({ where: { key: 'gold-coin' }, select: { id: true } });
        if (!gold) {
          throw new Error('gold-coin reward row is missing from `rewards`.');
        }
        await tx.profileReward.create({
          data: { profileId, rewardId: gold.id, reason: 'achievement', amount: achievement.coinReward },
        });
      }

      // Badge XP is ledgered like the coins: the amount configured at claim time
      // is frozen in its own row, so later admin edits never rewrite history.
      // getCheckinExperience / getExperienceByProfile sum every `experience`
      // reward row regardless of reason, so this feeds the XP total as-is.
      if (achievement.xpReward > 0) {
        const experience = await tx.reward.findFirst({ where: { key: Reward.EXPERIENCE }, select: { id: true } });
        if (!experience) {
          throw new Error('experience reward row is missing from `rewards`.');
        }
        await tx.profileReward.create({
          data: { profileId, rewardId: experience.id, reason: 'achievement', amount: achievement.xpReward },
        });
      }

      return {
        achievementId: achievement.id,
        coinReward: achievement.coinReward,
        xpReward: achievement.xpReward,
        claimedAt: now,
      };
    });

    // Fire-and-forget feed notification — both the claim and redeem endpoints
    // funnel through here, so this covers every off-chain achievement award.
    void (async () => {
      try {
        const [profile, achievement] = await Promise.all([
          prisma.profile.findUnique({ where: { id: profileId }, select: { walletAddress: true } }),
          prisma.achievement.findUnique({ where: { key }, select: { name: true } }),
        ]);
        if (profile) {
          await notify({
            walletAddress: profile.walletAddress,
            type: 'reward',
            messageKey: 'achievementUnlocked',
            params: { name: achievement?.name ?? key },
            link: '/profile/achievements',
            dedupeKey: `achievement-${profileId}-${key}`,
          });
        }
      } catch (err) {
        console.error('Error notifying achievement claim', { profileId, key }, err);
      }
    })();

    return {
      success: true as const,
      achievementId: Number(achievementId),
      coinReward,
      xpReward,
      claimedAt: claimedAt.toISOString(),
    };
  } catch (error) {
    // Prisma raises P2002 on the UNIQUE (profile_id, achievement_id) violation =
    // already claimed. Keep the raw 23505 check as a fallback for raw paths.
    const code =
      (error as { code?: string })?.code ??
      (error as { meta?: { code?: string } })?.meta?.code;
    const alreadyClaimed =
      code === 'P2002' || code === '23505' || /23505/.test(String((error as Error)?.message ?? ''));
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
    const deposits = await getDepositSignalsByWallet(profile.wallet_address);
    for (const deposit of deposits) {
      // Balance-style signals count only money still in the vault...
      if (deposit.active) {
        activeDeposits++;
        activeAmount += deposit.amount || 0;
      }
      // ...but XP is earned history: withdrawn deposits keep what they accrued.
      experience += depositExperience(deposit.amount, deposit.createdTimestamp, deposit.endTimestamp);
    }
  } catch (error) {
    console.warn('[eligibility] failed to load deposits', error);
  }

  // Check-in XP is part of the XP the user is shown (see
  // toProfileExperienceResponseDTO), so a rule like "earn 300 XP" must evaluate
  // the same total — otherwise the profile says 306 XP while the badge rule sees
  // only the deposit share and stays locked.
  try {
    experience += await getCheckinExperience(profile.id);
  } catch (error) {
    console.warn('[eligibility] failed to load check-in experience', error);
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

// ---------------------------------------------------------------------------
// Unlock latch — a badge is never un-earned.
//
// Every rule signal can go down: withdraw a deposit and `activeDeposits` /
// `activeAmount` drop, miss a day and `streakCount` resets, unfollow and
// `friendsCount` falls. Evaluating the live rule alone therefore re-locked
// badges the user had already been shown as earned. The latch records the first
// moment a profile satisfied a rule, and eligibility is read as
// `liveRule(signals) OR latched` — the rule can only ever open it.
// ---------------------------------------------------------------------------

/** Achievement ids this profile has ever satisfied the rule for. */
export const getUnlockedAchievementIds = async (profileId: number): Promise<Set<string>> => {
  try {
    const rows = await prisma.profileAchievementUnlock.findMany({
      where: { profileId },
      select: { achievementId: true },
    });
    return new Set(rows.map((row) => String(row.achievementId)));
  } catch (error) {
    console.warn('[eligibility] failed to load unlock latches', error);
    return new Set<string>();
  }
};

/**
 * Record that this profile now satisfies these badges' rules. Idempotent —
 * `skipDuplicates` keeps the original `unlocked_at` so the latch always reflects
 * the *first* time the badge was earned. Best-effort: a failure here must never
 * break the catalog response, it just means the latch is written on a later read.
 */
export const latchAchievementUnlocks = async (
  profileId: number,
  achievementIds: bigint[],
): Promise<void> => {
  if (achievementIds.length === 0) return;
  try {
    await prisma.profileAchievementUnlock.createMany({
      data: achievementIds.map((achievementId) => ({ profileId, achievementId })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.warn('[eligibility] failed to persist unlock latches', error);
  }
};

/**
 * Eligibility for a rule badge, latch included: true when the live rule passes
 * now **or** when it passed at any point in the past. Use this instead of
 * {@link isAchievementEligible} anywhere a user-facing decision is made (catalog
 * rows, voucher issuance, mint finalization) so the answer can never regress.
 */
export const isAchievementUnlocked = (
  achievement: AchievementDocument,
  signals: EligibilitySignals,
  latched: Set<string>,
): boolean =>
  isAchievementEligible(achievement, signals) || latched.has(String(achievement.id));

export const toProfileAchievementsResponseDTO = async (
  networkName: string,
  profile: Profile,
): Promise<ProfileAchievementsResponseDTO> => {
  // One set of DB calls feeds both the catalog AND the per-row eligibility
  // computation below. computeEligibilitySignals reuses the deposit-signals
  // helper so this isn't free, but it's bounded — a small handful of queries.
  const [allRes, claimedRes, signals, minted, activeClaims, awardCycleId, latched] = await Promise.all([
    getAllAchievements(),
    getClaimedAchievements(profile.id),
    computeEligibilitySignals(profile),
    getMintedBadges(profile.wallet_address),
    getActiveBadgeClaimsForWallet(profile.wallet_address),
    getLastClosedCycleId(),
    getUnlockedAchievementIds(profile.id),
  ]);

  // This read is where a newly-met rule gets latched: anything eligible right now
  // that isn't on record yet is persisted below, so the unlock survives the
  // signal falling back down later.
  const newlyUnlocked: bigint[] = [];

  const claimedById = new Map<number, ProfileAchievement>(
    claimedRes.data.map((row) => [row.achievement_id, row]),
  );

  // On-chain mints are keyed by badge_type, which equals the achievement key.
  // Keep the tx hash alongside so clients can link an already-minted badge to
  // its stellar.expert transaction without triggering a re-mint.
  const mintedByKey = new Map(minted.map((m) => [m.badge_type, m.transaction_hash]));
  const activeClaimByKey = new Map(activeClaims.map((claim) => [claim.badge_type, claim]));
  const leaderboardRank = await getLeaderboardRankForWallet(profile.wallet_address, awardCycleId);

  const achievements: AchievementResponseDTO[] = allRes.data
    // Hide secret achievements until the user actually claims them — the
    // catalog endpoint must not leak the existence of redeem-code badges.
    .filter((a) => !a.hidden || claimedById.has(a.id) || activeClaimByKey.has(a.key))
    // Drop retired (disabled) badges, but keep any the user already earned so a
    // soft-delete (`enabled = false`) never strips a badge someone already
    // owns, has pending, or minted on-chain.
    .filter(
      (a) =>
        a.enabled !== false ||
        claimedById.has(a.id) ||
        activeClaimByKey.has(a.key) ||
        mintedByKey.has(a.key),
    )
    .map((a) => {
      const claim = claimedById.get(a.id);
      const pendingClaim = activeClaimByKey.get(a.key);
      const mintedForKey = mintedByKey.has(a.key);
      const exactRank: Record<string, number> = { first_place: 1, second_place: 2 };
      const cycleRankEligible =
        a.key === Achievement.THIRD_PLACE
          ? leaderboardRank !== null && leaderboardRank >= 3 && leaderboardRank <= 10
          : leaderboardRank === exactRank[a.key];
      if (isAchievementEligible(a, signals) && !latched.has(String(a.id))) {
        newlyUnlocked.push(BigInt(a.id));
      }
      const eligible =
        a.unlock_type === 'cycle_rank'
          ? cycleRankEligible && !claim
          : isAchievementUnlocked(a, signals, latched);
      const claimState = mintedForKey
        ? 'minted'
        : claim
          ? 'claimed'
          : pendingClaim
            ? 'pending_mint'
            : eligible
              ? 'claimable'
              : 'locked';

      return {
        key: a.key as Achievement,
        name: a.name,
        description: a.description,
        tier: a.tier,
        coinReward: a.coin_reward,
        // `unlocked` is true if eligibility OR claim — claim implies the user
        // was eligible at the time, so flipping it to true here keeps the tile
        // showing as "earned" even if the eligibility rule later tightens.
        unlocked: !!claim || !!pendingClaim || eligible || mintedForKey,
        claimedAt: claim?.claimed_at ?? null,
        minted: mintedForKey,
        // Empty string from getMintedBadges (unconfirmed/missing) normalizes to null.
        transactionHash: mintedByKey.get(a.key) || null,
        claimState,
        claimCycleId: pendingClaim?.cycle_id ?? null,
        awardCycleId: a.unlock_type === 'cycle_rank' ? awardCycleId : null,
        icon: a.icon ?? null,
        accent: a.accent ?? null,
        displayOrder: a.display_order ?? 0,
      };
    });

  await latchAchievementUnlocks(profile.id, newlyUnlocked);

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
    // Case-insensitive a propósito: el input del modal de canje se PINTA en
    // mayúsculas (clase CSS `uppercase`) pero manda lo que el usuario tecleó,
    // así que un código guardado en minúsculas ('starmaker') no matcheaba y el
    // usuario veía "código inválido" con el código correcto en pantalla.
    // También cubre los QR y a quien lo escriba a mano como se le ocurra.
    const row = await prisma.achievement.findFirst({
      where: { code: { equals: code, mode: 'insensitive' }, deletedAt: null },
    });
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

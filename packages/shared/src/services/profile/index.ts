import { getCurrentDay } from '../../helpers/date';
import { supabase } from '../../lib/supabase';
import { ably } from '../ably';
import {
  Achievement,
  type AchievementDocument,
  type AchievementResponseDTO,
  type DepositResponseDTO,
  DepositWithdrawalState,
  type MapObject,
  MapObjectType,
  type Network,
  type Profile,
  type ProfileAchievement,
  type ProfileAchievementsResponseDTO,
  type ProfileExperienceResponseDTO,
  type ProfileMapObjectsAvailableResponseDTO,
  type ProfileMapObjectsResponseDTO,
  type ProfileResponseDTO,
  type ProfileReward,
  type ProfileRewardsResponseDTO,
  type ProfileStreakResponseDTO,
  Reward,
  type RewardDocument,
  type RewardResponseDTO,
} from '../../types';
import {
  dataToDepositResponseDTOTotalDepositsResponseDTO,
  getCachedDepositsByNetworkIdWalletAddress,
} from '../deposit';
import { getNetworkByName } from '../network';
import { BETA_TESTER_CUTOFF, DAILY_GOLD_COINS } from './constants';
import { friendlyStandardMap } from './map-template';

export const listenProfilesChanges = async (onChange: () => void) => {
  await supabase.realtime.setAuth();
  supabase
    .channel(`table:profiles`, {
      config: { private: true },
    })
    .on('broadcast', { event: '*' }, () => {
      onChange();
    })
    .subscribe((status) => {
      console.info('Estado canal profiles:', status);
    });
};

export const listenProfilesDepositsChanges = async (onChange: () => void) => {
  await supabase.realtime.setAuth();
  supabase
    .channel(`table:profiles_deposits`, {
      config: { private: true },
    })
    .on('broadcast', { event: '*' }, () => {
      onChange();
    })
    .subscribe((status) => {
      console.info('Estado canal profiles_deposits:', status);
    });
};

export const getProfilesByNetworkId = async (networkId: number) => {
  const { data, ...rest } = await supabase
    .from('profiles')
    .select('*')
    .eq('network_id', networkId);

  return {
    data: (data || []) as Profile[],
    ...rest,
  };
};

export const getProfiles = async () => {
  const { data, ...rest } = await supabase
    .from('profiles')
    .select('*');

  return {
    data: (data || []) as Profile[],
    ...rest,
  };
};

export const profilesCacheRef: { current: any | null } = { current: null };

export const getCachedProfiles = async () => {
  // if (profilesCacheRef.current) {
  //   return profilesCacheRef.current;
  // }

  profilesCacheRef.current = await getProfiles();
  return profilesCacheRef.current;
};

export const profilesDepositsByProfileIdCacheRef: { current: { [key: string]: any } } = { current: {} };

async function getProfilesDepositsByProfileId(profileId: number) {
  const { error, ...rest } = await supabase
    .from('profiles_deposits')
    .select('*')
    .eq('profile_id', profileId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error on profileIncrement', { profileId }, error);
  }

  return {
    error,
    ...rest,
  };
}

export async function getCachedProfilesDepositsByProfileId(profileId: number) {
  // const cachedData = profilesDepositsByProfileIdCacheRef.current[profileId];
  // if (cachedData) {
  //   return cachedData;
  // }

  const data = await getProfilesDepositsByProfileId(profileId);
  profilesDepositsByProfileIdCacheRef.current[profileId] = data;

  return data;
}

export async function createProfilesDepositsByProfileId(profileId: number) {
  const { error, ...rest } = await supabase
    .from('profiles_deposits')
    .insert({
      total_active_deposits: [],
      total_active_deposits_count: 0,
      profile_id: profileId,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error on createProfilesDepositsByProfileId', error);
  }

  return {
    error,
    ...rest,
  };
}

export async function profileIncrement(profileId: number, totalActiveDeposits: number[], totalActiveDepositsCount: number, timestamp: number) {
  const { error } = await supabase
    .from('profiles_deposits')
    .update({
      total_active_deposits: totalActiveDeposits,
      total_active_deposits_count: totalActiveDepositsCount,
      timestamp: new Date(timestamp),
    })
    .eq('profile_id', profileId)
    .select();

  if (error) {
    console.error('Error on profileIncrement', error);
  }
}

export const getRewardByKey = async (rewardKey: Reward) => {
  const { data, ...rest } = await supabase
    .from('rewards')
    .select(`
      *
    `)
    .eq('key', rewardKey)
    .maybeSingle();

  return {
    data: data as RewardDocument | null,
    ...rest,
  };
};

export const getProfile = async (networkName: string, walletAddress: string) => {

  const { data: networkData, error: networkError } = await getNetworkByName(networkName);

  if (networkError || !networkData) {
    return {
      success: false,
      errorMessage: 'Network not found',
      errors: networkError,
      networkData: null,
      profileData: null,
    };
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('network_id', networkData.id)
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (profileData) {
    return {
      success: true,
      errorMessage: '',
      errors: [],
      networkData,
      profileData: profileData as Profile,
    };
  }

  const newProfile = {
    network_id: networkData.id,
    wallet_address: walletAddress,
  };

  const result = await supabase
    .from('profiles')
    .insert([ newProfile ])
    .select()
    .maybeSingle();

  return {
    success: true,
    errorMessage: '',
    errors: [],
    networkData,
    profileData: result.data as Profile,
  };
};

export const getRewardsData = async (networkData: Network, profileData: Profile) => {

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

  const { data: profileRewardData } = await supabase
    .from('profiles_rewards')
    .select('*, rewards(*)')
    .eq('profile_id', profileData.id)
    .eq('reward_id', rewardData.id);

  let collected = 0;
  let amount = 0;
  for (const profileReward of (profileRewardData || []) as ProfileReward[]) {
    if (profileReward.type === 'collected' && profileReward?.rewards?.key === Reward.GOLD_COIN && getCurrentDay(new Date(profileReward.created_at)) === getCurrentDay(new Date())) {
      collected += profileReward?.amount || 0;
    }
    if (profileReward.type === 'collected' || profileReward.type === 'earned') {
      amount += profileReward?.amount || 0;
    }
  }

  const rewards: RewardResponseDTO[] = [
    {
      key: Reward.GOLD_COIN,
      name: 'Gold Coin',
      amountToCollect: Math.max(DAILY_GOLD_COINS - collected, 0),
      amount,
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

export const getStreakData = async (networkData: Network, profileData: Profile) => {
  const { data } = await supabase
    .from('deposits')
    .select(`
      id,confirmed_at
    `)
    .eq('wallet_address', profileData.wallet_address)
    .eq('network_id', networkData.id)
    .eq('status', 'confirmed');
  const { data: profileRewardsData, error } = await supabase
    .from('profiles_rewards')
    .select(`
      id,created_at
    `)
    .eq('profile_id', profileData.id)
    .eq('type', 'collected');

  const daysSet = new Set<number>();

  for (const deposit of (data || [])) {
    daysSet.add(getCurrentDay(new Date(deposit.confirmed_at || 0)));
  }
  for (const deposit of (profileRewardsData || [])) {
    daysSet.add(getCurrentDay(new Date(deposit.created_at || 0)));
  }

  const todayDay = getCurrentDay(new Date());
  let streak = 0;
  let d = todayDay - 1;

  while (daysSet.has(d)) {
    streak++;
    d--;
  }

  return {
    success: true,
    errorMessage: '',
    errors: [],
    yesterdayStreak: streak,
    todayStreak: daysSet.has(todayDay),
    days: Array.from(daysSet),
  };
};

export const getMapObjectsAvailableData = async (networkData: Network, profileData: Profile) => {

  const { data } = await supabase
    .from('map_objects')
    .select('*');

  const objects: ProfileMapObjectsAvailableResponseDTO['objects'] = [];
  for (const { variants, type, prices, free_items } of (data || [])) {
    const objectVariants = (variants || '').split(',').map(Number);
    const objectPrices = (prices || '').split(',').map(Number);
    const objectFreeItems = (free_items || '').split(',').map(Number);
    for (let i = 0; i < objectVariants.length; i++) {
      const variant = objectVariants[i];
      if (variant >= 0 && variant <= 100) {
        objects.push({
          type,
          variant,
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

export const toProfileResponseDTO = (networkData: Network, profile: Profile): ProfileResponseDTO => {

  return {
    walletAddress: profile?.wallet_address || '',
    networkName: networkData?.name || '',
    email: profile.email ?? '',
    fullName: profile.full_name ?? '',
    nickname: profile.nickname ?? '',
  };
};

export const toProfileExperienceResponseDTO = async (networkData: Network, profile: Profile): Promise<ProfileExperienceResponseDTO> => {
  let deposits: DepositResponseDTO[] = [];
  try {
    const { data } = await getCachedDepositsByNetworkIdWalletAddress(networkData.id, profile.wallet_address);
    const response = await dataToDepositResponseDTOTotalDepositsResponseDTO(
      networkData,
      data ?? [],
      false,
      true,
    );
    deposits = response.deposits as DepositResponseDTO[];
  } catch (error) {
    console.warn('error on toProfileResponseDTO', error);
  }

  let experience = 0;
  for (const deposit of deposits) {
    if (deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS) {
      const timeElapsed = Math.max(Date.now() - deposit.createdTimestamp, 0);
      experience += Math.sqrt(deposit.amount || 0) * Math.sqrt(timeElapsed / (1000 * 60 * 60));
    }
  }

  return {
    walletAddress: profile?.wallet_address || '',
    networkName: networkData?.name || '',
    experience,
  };
};

export const toProfileRewardsResponseDTO = async (networkData: Network, profile: Profile): Promise<ProfileRewardsResponseDTO> => {

  const { rewards } = await getRewardsData(networkData, profile);

  return {
    walletAddress: profile?.wallet_address || '',
    networkName: networkData?.name || '',
    rewards: rewards.map(reward => ({ name: reward.name, amount: reward.amount })),
  };
};

export const toProfileStreakResponseDTO = async (networkData: Network, profile: Profile): Promise<ProfileStreakResponseDTO> => {

  const { todayStreak, yesterdayStreak, days } = await getStreakData(networkData, profile);

  return {
    walletAddress: profile?.wallet_address || '',
    networkName: networkData?.name || '',
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
  const { data } = await supabase
    .from('profiles_map_objects')
    .select('*')
    .eq('profile_id', profile.id)
    .maybeSingle();
  if (data) {
    return {
      success: true,
      errorMessage: '',
      errors: [],
      profileMapObjects: {
        ...data,
        objects: toMapObjects(data?.objects || []),
      },
    };
  }

  const newProfile = {
    profile_id: profile.id,
    objects: friendlyStandardMap,
  };

  const { data: dataNew } = await supabase
    .from('profiles_map_objects')
    .insert([ newProfile ])
    .select()
    .maybeSingle();

  return {
    success: true,
    errorMessage: '',
    errors: [],
    profileMapObjects: {
      ...dataNew,
      objects: toMapObjects(dataNew?.objects || []),
    },
  };
};

export const toProfileMapObjectsResponseDTO = async (networkData: Network, profile: Profile): Promise<ProfileMapObjectsResponseDTO> => {

  const { profileMapObjects } = await getProfileMapObjects(profile);

  return {
    walletAddress: profile?.wallet_address || '',
    networkName: networkData?.name || '',
    objects: profileMapObjects?.objects || [],
  };
};

export const toProfileMapObjectsAvailableResponseDTO = async (networkData: Network, profile: Profile): Promise<ProfileMapObjectsAvailableResponseDTO> => {

  const { objects } = await getMapObjectsAvailableData(networkData, profile);

  return {
    walletAddress: profile?.wallet_address || '',
    networkName: networkData?.name || '',
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

export const getAchievementByKey = async (key: Achievement) => {
  const { data, ...rest } = await supabase
    .from('achievements')
    .select('*')
    .eq('key', key)
    .maybeSingle();

  return {
    data: data as AchievementDocument | null,
    ...rest,
  };
};

export const getAllAchievements = async () => {
  const { data, ...rest } = await supabase
    .from('achievements')
    .select('*')
    .order('id', { ascending: true });

  return {
    data: (data || []) as AchievementDocument[],
    ...rest,
  };
};

export const getClaimedAchievements = async (profileId: number) => {
  const { data, ...rest } = await supabase
    .from('profiles_achievements')
    .select('*, achievements(*)')
    .eq('profile_id', profileId);

  return {
    data: (data || []) as ProfileAchievement[],
    ...rest,
  };
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
  const { data, error } = await supabase.from('profiles_achievements').select('profile_id');
  const counts = new Map<number, number>();
  for (const row of (data ?? []) as { profile_id: number }[]) {
    counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1);
  }
  return { counts, error };
};

/**
 * Inserts the ledger row + the matching gold-coin credit in a single Postgres
 * transaction via the `claim_achievement` PL/pgSQL function. The UNIQUE
 * constraint on (profile_id, achievement_id) surfaces a repeat claim as error
 * code 23505 (`unique_violation`), which we flag back to the caller via
 * `alreadyClaimed` so the API layer can turn it into a 409.
 */
export const claimAchievement = async (profileId: number, key: Achievement) => {
  const { data, error } = await supabase.rpc('claim_achievement', {
    p_profile_id: profileId,
    p_achievement_key: key,
  });

  if (error) {
    const alreadyClaimed = (error as { code?: string })?.code === '23505';
    return { success: false as const, alreadyClaimed, error };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    success: true as const,
    achievementId: Number(row?.achievement_id ?? 0),
    coinReward: Number(row?.coin_reward ?? 0),
    claimedAt: String(row?.claimed_at ?? new Date().toISOString()),
  };
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
  /** Followers/friends count. TODO: wire when a friends system exists. */
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
  networkData: Network,
  profile: Profile,
): Promise<EligibilitySignals> => {
  let deposits: DepositResponseDTO[] = [];
  try {
    const { data } = await getCachedDepositsByNetworkIdWalletAddress(networkData.id, profile.wallet_address);
    const response = await dataToDepositResponseDTOTotalDepositsResponseDTO(networkData, data ?? [], false, true);
    deposits = response.deposits as DepositResponseDTO[];
  } catch (error) {
    console.warn('[eligibility] failed to load deposits', error);
  }

  let activeDeposits = 0;
  let activeAmount = 0;
  let experience = 0;
  for (const deposit of deposits) {
    if (deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS) {
      activeDeposits++;
      activeAmount += deposit.amount || 0;
      const timeElapsed = Math.max(Date.now() - deposit.createdTimestamp, 0);
      experience += Math.sqrt(deposit.amount || 0) * Math.sqrt(timeElapsed / (1000 * 60 * 60));
    }
  }

  let streakCount = 0;
  try {
    const streak = await getStreakData(networkData, profile);
    streakCount = streak.yesterdayStreak + (streak.todayStreak ? 1 : 0);
  } catch (error) {
    console.warn('[eligibility] failed to load streak', error);
  }

  const createdAt = profile.created_at ? new Date(profile.created_at) : null;

  return {
    createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
    experience,
    streakCount,
    activeDeposits,
    activeAmount,
    friendsCount: 0,
    leaderboardRank: undefined,
  };
};

/**
 * Eligibility table for server-side claimable achievements. Stateless — pass
 * the result of {@link computeEligibilitySignals} as `signals`. The thresholds
 * mirror the frontend rules in `apps/web/src/core-ui/data/profile-badges.ts`
 * so a tile that displays as "earned" in the UI also unlocks the Claim CTA.
 *
 * Friends + leaderboard achievements stay `false` until those systems exist.
 */
export const isEligibleForAchievement = (signals: EligibilitySignals, key: Achievement): boolean => {
  switch (key) {
    case Achievement.BETA_TESTER:
      return !!signals.createdAt && signals.createdAt.getTime() <= BETA_TESTER_CUTOFF.getTime();
    case Achievement.ROOKIE:
      return signals.experience >= 50;
    case Achievement.WEEK_WARRIOR:
      return signals.streakCount >= 7;
    case Achievement.FIRST_DEPOSIT:
      return signals.activeDeposits >= 1;
    case Achievement.FIRST_FRIEND:
      return signals.friendsCount >= 1;
    case Achievement.SAVINGS_STARTER:
      return signals.activeAmount >= 100;
    case Achievement.TRIO_SAVER:
      return signals.activeDeposits >= 3;
    case Achievement.MONTH_MASTER:
      return signals.streakCount >= 30;
    case Achievement.EXPLORER:
      return signals.experience >= 300;
    case Achievement.STREAK_MASTER:
      return signals.streakCount >= 50;
    case Achievement.WHALE:
      return signals.experience >= 30000;
    case Achievement.SAVINGS_BARON:
      return signals.activeAmount >= 10000;
    case Achievement.CENTURY_SAVER:
      return signals.streakCount >= 100;
    case Achievement.THIRD_PLACE:
      return signals.leaderboardRank === 3;
    case Achievement.SECOND_PLACE:
      return signals.leaderboardRank === 2;
    case Achievement.FIRST_PLACE:
      return signals.leaderboardRank === 1;
    default:
      return false;
  }
};

export const toProfileAchievementsResponseDTO = async (
  networkData: Network,
  profile: Profile,
): Promise<ProfileAchievementsResponseDTO> => {
  // One set of DB calls feeds both the catalog AND the per-row eligibility
  // computation below. computeEligibilitySignals reuses the cached deposits
  // helper so this isn't free, but it's bounded — a small handful of queries.
  const [allRes, claimedRes, signals] = await Promise.all([
    getAllAchievements(),
    getClaimedAchievements(profile.id),
    computeEligibilitySignals(networkData, profile),
  ]);

  const claimedById = new Map<number, ProfileAchievement>(
    claimedRes.data.map((row) => [row.achievement_id, row]),
  );

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
        unlocked: !!claim || isEligibleForAchievement(signals, a.key as Achievement),
        claimedAt: claim?.claimed_at ?? null,
      };
    });

  return {
    walletAddress: profile?.wallet_address || '',
    networkName: networkData?.name || '',
    achievements,
  };
};

// ---------------------------------------------------------------------------
// Redeem codes
// ---------------------------------------------------------------------------

export const getAchievementByCode = async (code: string) => {
  const { data, ...rest } = await supabase
    .from('achievements')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  return {
    data: data as AchievementDocument | null,
    ...rest,
  };
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

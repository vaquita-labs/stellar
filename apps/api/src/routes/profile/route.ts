import { Router } from 'express';
import {
  Achievement,
  broadcastProfileChange,
  claimAchievement,
  getCachedProfilesDepositsByProfileId,
  getNetworkByName,
  getProfile,
  getProfileMapObjects,
  getProfilesByNetworkId,
  getRewardByKey,
  getRewardsData,
  HISTORICAL_DELAY,
  isEligibleForAchievement,
  type Network,
  ONE_DAY,
  type Profile,
  type ProfileAverageResponseDTO,
  redeemAchievementCode,
  Reward,
  sendError,
  sendSuccess,
  supabase,
  toProfileAchievementsResponseDTO,
  toProfileExperienceResponseDTO,
  toProfileMapObjectsAvailableResponseDTO,
  toProfileMapObjectsResponseDTO,
  toProfileResponseDTO,
  toProfileRewardsResponseDTO,
  toProfileStreakResponseDTO,
} from '@vaquita/shared';
import type { Logger } from 'pino';

const router = Router();

// TODO: remove when main branch vaquita-ui is merged with dev
router.get('/network/:networkName/wallet/:walletAddress', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /profile/network/:networkName/wallet/:walletAddress');

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, toProfileResponseDTO(networkData!, profileData));
});

router.get('/network/:networkName/wallet/:walletAddress/data', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /profile/.../data');

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, toProfileResponseDTO(networkData!, profileData));
});

router.get('/network/:networkName/wallet/:walletAddress/experience', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /profile/.../experience');

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileExperienceResponseDTO(networkData!, profileData));
});

router.get('/network/:networkName/wallet/:walletAddress/rewards', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /profile/.../rewards');

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileRewardsResponseDTO(networkData!, profileData));
});

router.get('/network/:networkName/wallet/:walletAddress/streak', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /profile/.../streak');

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileStreakResponseDTO(networkData!, profileData));
});

router.get('/network/:networkName/wallet/:walletAddress/daily-check', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /profile/.../daily-check');

  const { success, errorMessage, errors, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData || !networkData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved for daily-check');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  const rewardsResponse = await getRewardsData(networkData, profileData);

  if (!rewardsResponse.success) {
    req.log.error({ errors: rewardsResponse.errors, errorMessage: rewardsResponse.errorMessage }, 'Failed to fetch rewards data');
    return sendError(res, rewardsResponse.errorMessage, rewardsResponse.errors, 500);
  }

  return sendSuccess(res, rewardsResponse.rewards);
});

router.get('/network/:networkName/wallet/:walletAddress/map-objects', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /profile/.../map-objects');

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileMapObjectsResponseDTO(networkData!, profileData));
});

router.post('/network/:networkName/wallet/:walletAddress/map-objects', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  const { objects } = req.body ?? {};
  req.log.info({ networkName, walletAddress, objectsCount: Array.isArray(objects) ? objects.length : undefined }, 'POST /profile/.../map-objects');

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  const { profileMapObjects } = await getProfileMapObjects(profileData);

  const result = await supabase
    .from('profiles_map_objects')
    .update({ objects })
    .eq('id', profileMapObjects.id)
    .maybeSingle();

  if (result.error) {
    req.log.error({ err: result.error, profileMapObjectsId: profileMapObjects.id }, 'Failed to update map objects');
    return sendError(res, 'Failed to update map objects', result.error, 500);
  }

  return sendSuccess(res, result);
});

router.get('/network/:networkName/wallet/:walletAddress/map-objects-available', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /profile/.../map-objects-available');

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileMapObjectsAvailableResponseDTO(networkData!, profileData));
});

router.post('/network/:networkName/wallet/:walletAddress/gold-daily-collect', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'POST /profile/.../gold-daily-collect');

  const { success, errorMessage, errors, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData || !networkData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved for gold-daily-collect');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  const rewardsResponse = await getRewardsData(networkData, profileData);

  if (!rewardsResponse.success) {
    req.log.error({ errors: rewardsResponse.errors, errorMessage: rewardsResponse.errorMessage }, 'Failed to fetch rewards data');
    return sendError(res, rewardsResponse.errorMessage, rewardsResponse.errors, 500);
  }

  const { data: rewardData, error: rewardError } = await getRewardByKey(Reward.GOLD_COIN);

  if (rewardError || !rewardData) {
    req.log.error({ err: rewardError, key: Reward.GOLD_COIN }, 'Reward not found');
    return sendError(res, 'reward not found', rewardError, 404);
  }

  const goldRewardToAmount = rewardsResponse.rewards.find((reward) => reward.key === Reward.GOLD_COIN)?.amountToCollect;

  if (!goldRewardToAmount) {
    req.log.warn({ profileId: profileData.id }, 'No gold coins available to collect');
    return sendError(res, 'there are no gold coins to collect', null, 400);
  }

  const result = await supabase
    .from('profiles_rewards')
    .insert({
      profile_id: profileData.id,
      reward_id: rewardData.id,
      type: 'collected',
      amount: 1,
    });

  if (result.error) {
    req.log.error({ err: result.error, profileId: profileData.id, rewardId: rewardData.id }, 'Failed to insert profile reward');
    return sendError(res, 'Failed to collect gold coin', result.error, 500);
  }

  try {
    await broadcastProfileChange('gold-daily-collected', [ 'profile-rewards', 'profile-experience' ]);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (gold-daily-collected)');
    // No retornamos error: el reward ya se guardó. Cliente reconcilia en siguiente fetch.
  }

  req.log.info({ profileId: profileData.id }, 'Gold coin collected');
  return sendSuccess(res, result);
});

router.get('/network/:networkName/wallet/:walletAddress/achievements', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /profile/.../achievements');

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData || !networkData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  return sendSuccess(res, await toProfileAchievementsResponseDTO(networkData, profileData));
});

router.post('/network/:networkName/wallet/:walletAddress/achievements/:key/claim', async (req, res) => {
  const { networkName, walletAddress, key } = req.params;
  req.log.info({ networkName, walletAddress, key }, 'POST /profile/.../achievements/:key/claim');

  // TODO(auth): match the wallet-in-URL trust used by every other profile
  // route for v1. When we harden auth across the API (challenge/response via
  // StellarWalletsKit.signMessage verified server-side), this endpoint moves
  // along with the rest — don't add a one-off signature check here.

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData || !networkData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved for achievement claim');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  const achievementKey = key as Achievement;
  if (!Object.values(Achievement).includes(achievementKey)) {
    req.log.warn({ key }, 'Unknown achievement key');
    return sendError(res, `Unknown achievement: ${key}`, null, 404);
  }

  if (!isEligibleForAchievement(profileData, achievementKey)) {
    req.log.warn({ profileId: profileData.id, key }, 'Profile is not eligible for achievement');
    return sendError(res, 'You are not eligible for this achievement yet.', null, 403);
  }

  const result = await claimAchievement(profileData.id, achievementKey);

  if (!result.success) {
    if (result.alreadyClaimed) {
      req.log.info({ profileId: profileData.id, key }, 'Achievement already claimed');
      return sendError(res, 'You already claimed this achievement.', null, 409);
    }
    req.log.error({ err: result.error, profileId: profileData.id, key }, 'Failed to claim achievement');
    return sendError(res, 'Failed to claim achievement', result.error, 500);
  }

  try {
    await broadcastProfileChange('achievement-claimed', [
      'profile-achievements',
      'profile-rewards',
      'profile-experience',
    ]);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (achievement-claimed)');
  }

  req.log.info({ profileId: profileData.id, key, coinReward: result.coinReward }, 'Achievement claimed');
  return sendSuccess(res, {
    achievementKey,
    coinReward: result.coinReward,
    claimedAt: result.claimedAt,
  });
});

router.post('/network/:networkName/wallet/:walletAddress/achievements/redeem', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  req.log.info({ networkName, walletAddress, code: rawCode }, 'POST /profile/.../achievements/redeem');

  // TODO(auth): same wallet-in-URL trust as every other profile route. When
  // the API-wide auth hardening lands this endpoint follows along.

  if (!rawCode) {
    return sendError(res, 'A code is required.', null, 400);
  }

  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData || !networkData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved for redeem');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  const result = await redeemAchievementCode(profileData.id, rawCode);

  if (!result.success) {
    if (result.notFound) {
      req.log.info({ profileId: profileData.id, code: rawCode }, 'Redeem code not found');
      return sendError(res, 'That code is not valid.', null, 404);
    }
    if (result.alreadyClaimed) {
      req.log.info({ profileId: profileData.id, code: rawCode }, 'Redeem code already claimed');
      return sendError(res, 'You already claimed this achievement.', null, 409);
    }
    req.log.error({ err: result.error, profileId: profileData.id, code: rawCode }, 'Failed to redeem code');
    return sendError(res, 'Failed to redeem code', result.error, 500);
  }

  try {
    await broadcastProfileChange('achievement-claimed', [
      'profile-achievements',
      'profile-rewards',
      'profile-experience',
    ]);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast (achievement-claimed via redeem)');
  }

  req.log.info(
    { profileId: profileData.id, key: result.achievementKey, coinReward: result.coinReward },
    'Achievement claimed via redeem code',
  );
  return sendSuccess(res, {
    achievementKey: result.achievementKey,
    coinReward: result.coinReward,
    claimedAt: result.claimedAt,
  });
});

router.post('/network/:networkName/wallet/:walletAddress/nickname', async (req, res) => {
  const { networkName, walletAddress } = req.params;
  const nickname = req.body?.nickname ?? '';
  req.log.info({ networkName, walletAddress, nickname }, 'POST /profile/.../nickname');

  const { success, errors, errorMessage, profileData, networkData } = await getProfile(networkName, walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, networkName, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('network_id', networkData.id)
    .eq('nickname', nickname);

  if (lookupError) {
    req.log.error({ err: lookupError, networkId: networkData.id, nickname }, 'Failed to check nickname availability');
    return sendError(res, 'Failed to check nickname availability', lookupError, 500);
  }

  if (existing && existing.length > 0) {
    req.log.warn({ nickname, networkId: networkData.id }, 'Nickname already in use');
    return sendError(res, 'The nickname is already in use.', null, 409);
  }

  const result = await supabase
    .from('profiles')
    .update({ nickname })
    .eq('id', profileData.id)
    .maybeSingle();

  if (result.error) {
    req.log.error({ err: result.error, profileId: profileData.id, nickname }, 'Failed to update nickname');
    return sendError(res, 'Failed to update nickname', result.error, 500);
  }

  try {
    await broadcastProfileChange('set-nickname', [ 'profile-data' ]);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-nickname)');
  }

  req.log.info({ profileId: profileData.id, nickname }, 'Nickname updated');
  return sendSuccess(res, result);
});

router.get('/network/:networkName', async (req, res) => {
  const { networkName } = req.params;
  req.log.info({ networkName }, 'GET /profile/network/:networkName');

  const { data: networkData, error: networkError } = await getNetworkByName(networkName);

  if (networkError || !networkData) {
    req.log.error({ err: networkError, networkName }, 'Network not found');
    return sendError(res, 'Network not found', networkError, 404);
  }

  const { data, error } = await getProfilesByNetworkId(networkData.id);

  if (error) {
    req.log.error({ err: error, networkId: networkData.id }, 'Failed to list profiles');
    return sendError(res, error.message, error, 500);
  }

  return sendSuccess(res, await Promise.all(data.map((profile) => toProfileResponseDTO(networkData, profile))), '');
});

const toProfileHistoricResponseDTO = (networkData: Network, log: Logger) =>
  async (profile: Profile): Promise<ProfileAverageResponseDTO> => {
    let totalSums = 0;
    const count = (ONE_DAY / HISTORICAL_DELAY) * 30;
    let lastSum = 0;
    let timestamp = 0;
    try {
      const { data, error } = await getCachedProfilesDepositsByProfileId(profile.id);
      if (error) {
        log.error({ err: error, profileId: profile.id }, 'Failed to fetch cached profile deposits (degraded)');
      }
      const sums = (data?.total_active_deposits || []);
      timestamp = new Date(data?.timestamp ?? 0).getTime();
      totalSums = sums.slice(-count).reduce((total: number, sum: number) => total + +sum, 0);
      lastSum = sums.slice(-1)?.[0] ?? 0;
    } catch (err) {
      log.error({ err, profileId: profile.id }, 'Exception in toProfileHistoricResponseDTO (degraded)');
    }

    return {
      email: profile.email ?? '',
      fullName: profile.full_name ?? '',
      nickname: profile.nickname ?? '',
      walletAddress: profile.wallet_address ?? '',
      totalSums,
      lastSum,
      count,
      timestamp,
      delay: HISTORICAL_DELAY,
    };
  };

router.get('/network/:networkName/by-average-deposits', async (req, res) => {
  const { networkName } = req.params;
  req.log.info({ networkName }, 'GET /profile/network/:networkName/by-average-deposits');

  const { data: networkData, error: networkError } = await getNetworkByName(networkName);

  if (networkError || !networkData) {
    req.log.error({ err: networkError, networkName }, 'Network not found');
    return sendError(res, 'Network not found', networkError, 404);
  }

  const { data, error } = await getProfilesByNetworkId(networkData.id);

  if (error) {
    req.log.error({ err: error, networkId: networkData.id }, 'Failed to list profiles');
    return sendError(res, error.message, error, 500);
  }

  return sendSuccess(res, await Promise.all(data.map(toProfileHistoricResponseDTO(networkData, req.log))), '');
});

export default router;
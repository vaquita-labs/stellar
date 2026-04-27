import { Router } from 'express';
import {
  broadcastProfileChange,
  getCachedProfilesDepositsByProfileId,
  getNetworkByName,
  getProfile,
  getProfileMapObjects,
  getProfilesByNetworkId,
  getRewardByKey,
  getRewardsData,
  HISTORICAL_DELAY,
  type Network,
  ONE_DAY,
  type Profile,
  type ProfileAverageResponseDTO,
  Reward,
  sendError,
  sendSuccess,
  supabase,
  toProfileExperienceResponseDTO,
  toProfileMapObjectsAvailableResponseDTO,
  toProfileMapObjectsResponseDTO,
  toProfileResponseDTO,
  toProfileRewardsResponseDTO,
  toProfileStreakResponseDTO,
} from '@vaquita/shared';

const router = Router();

// TODO: remove when main branch vaquita-ui is merged with dev
router.get('/network/:networkName/wallet/:walletAddress', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData) {
    return sendError(res, errorMessage, errors);
  }
  
  return sendSuccess(res, toProfileResponseDTO(networkData!, profileData));
});

router.get('/network/:networkName/wallet/:walletAddress/data', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData) {
    return sendError(res, errorMessage, errors);
  }
  
  return sendSuccess(res, toProfileResponseDTO(networkData!, profileData));
});

router.get('/network/:networkName/wallet/:walletAddress/experience', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData) {
    return sendError(res, errorMessage, errors);
  }
  
  return sendSuccess(res, await toProfileExperienceResponseDTO(networkData!, profileData));
});

router.get('/network/:networkName/wallet/:walletAddress/rewards', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData) {
    return sendError(res, errorMessage, errors);
  }
  
  return sendSuccess(res, await toProfileRewardsResponseDTO(networkData!, profileData));
});

router.get('/network/:networkName/wallet/:walletAddress/streak', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData) {
    return sendError(res, errorMessage, errors);
  }
  
  return sendSuccess(res, await toProfileStreakResponseDTO(networkData!, profileData));
});

router.get('/network/:networkName/wallet/:walletAddress/daily-check', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { success, errorMessage, errors, networkData, profileData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData || !networkData) {
    return {
      success: false,
      errorMessage,
      errors,
      rewards: [],
      profileData,
    };
  }
  
  const rewardsResponse = await getRewardsData(networkData, profileData);
  
  if (!rewardsResponse.success) {
    return sendError(res, rewardsResponse.errorMessage, rewardsResponse.errors);
  }
  
  return sendSuccess(res, rewardsResponse.rewards);
});

router.get('/network/:networkName/wallet/:walletAddress/map-objects', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData) {
    return sendError(res, errorMessage, errors);
  }
  
  return sendSuccess(res, await toProfileMapObjectsResponseDTO(networkData!, profileData));
});

router.post('/network/:networkName/wallet/:walletAddress/map-objects', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  const { objects } = req.body;
  
  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData) {
    return sendError(res, errorMessage, errors);
  }
  
  const { profileMapObjects } = await getProfileMapObjects(profileData);
  
  const result = await supabase
    .from('profiles_map_objects')
    .update({ 'objects': objects })
    .eq('id', profileMapObjects.id)
    .maybeSingle();
  
  return sendSuccess(res, result);
});

router.get('/network/:networkName/wallet/:walletAddress/map-objects-available', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { success, errors, errorMessage, networkData, profileData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData) {
    return sendError(res, errorMessage, errors);
  }
  
  return sendSuccess(res, await toProfileMapObjectsAvailableResponseDTO(networkData!, profileData));
});

router.post('/network/:networkName/wallet/:walletAddress/silver-daily-collect', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { success, errorMessage, errors, networkData, profileData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData || !networkData) {
    return {
      success: false,
      errorMessage,
      errors,
      rewards: [],
      profileData,
    };
  }
  
  const rewardsResponse = await getRewardsData(networkData, profileData);
  
  if (!rewardsResponse.success) {
    return sendError(res, rewardsResponse.errorMessage, rewardsResponse.errors);
  }
  
  const { data: rewardData, error } = await getRewardByKey(Reward.SILVER_COIN);
  
  if (!rewardData) {
    return sendError(res, 'reward not found', error);
  }
  
  const silverRewardToAmount = rewardsResponse.rewards.find((reward) => reward.key === Reward.SILVER_COIN)?.amountToCollect;
  
  if (!!silverRewardToAmount && profileData) {
    const result = await supabase
      .from('profiles_rewards')
      .insert({
        profile_id: profileData.id,
        reward_id: rewardData.id,
        type: 'collected',
        amount: 1,
      });
    await broadcastProfileChange('silver-daily-collected', [ 'profile-rewards', 'profile-experience' ]);
    return sendSuccess(res, result);
  }
  
  return sendError(res, 'there are no silver coins to collect');
});

router.post('/network/:networkName/wallet/:walletAddress/nickname', async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { success, errors, errorMessage, profileData, networkData } = await getProfile(networkName, walletAddress);
  
  if (!success || !profileData) {
    return sendError(res, errorMessage, errors);
  }
  
  const nickname = req.body.nickname ?? '';
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('network_id', networkData.id)
    .eq('nickname', nickname);
  
  if (!!profile?.length) {
    return sendError(res, 'The nickname is already in use.', errors);
  }
  
  const result = await supabase
    .from('profiles')
    .update({ nickname: req.body.nickname ?? '' })
    .eq('id', profileData.id)
    .maybeSingle();
  await broadcastProfileChange('set-nickname', [ 'profile-data' ]);
  return sendSuccess(res, result);
});

router.get('/network/:networkName', async (req, res) => {
  const { networkName } = req.params;
  
  const { data: networkData, error: networkError } = await getNetworkByName(networkName);
  
  if (networkError || !networkData) {
    return sendError(res, 'Network not found', networkError);
  }
  
  const { data, error } = await getProfilesByNetworkId(networkData.id);
  
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  sendSuccess(res, await Promise.all(data.map((profile) => toProfileResponseDTO(networkData, profile))), '');
});

const toProfileHistoricResponseDTO = (networkData: Network) => async (profile: Profile): Promise<ProfileAverageResponseDTO> => {
  let totalSums = 0;
  let count = (ONE_DAY / HISTORICAL_DELAY) * 30;
  let lastSum = 0;
  let timestamp = 0;
  try {
    const { data } = await getCachedProfilesDepositsByProfileId(profile.id);
    const sums = (data?.total_active_deposits || []);
    timestamp = new Date(data?.timestamp ?? 0).getTime();
    totalSums = sums.slice(-count).reduce((total: number, sum: number) => total + +sum, 0);
    lastSum = sums.slice(-1)?.[0] ?? 0;
  } catch (error) {
    console.warn('error on toProfileResponseDTO', error);
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
  
  const { data: networkData, error: networkError } = await getNetworkByName(networkName);
  
  if (networkError || !networkData) {
    return sendError(res, 'Network not found', networkError);
  }
  
  const { data, error } = await getProfilesByNetworkId(networkData.id);
  
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  sendSuccess(res, await Promise.all(data.map(toProfileHistoricResponseDTO(networkData))), '');
});

export default router;

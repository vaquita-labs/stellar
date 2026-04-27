import {
  createProfilesDepositsByProfileId,
  DepositWithdrawalState,
  getCachedDepositsByNetworkIdWalletAddress,
  getCachedProfiles,
  getCachedProfilesDepositsByProfileId,
  HISTORICAL_DELAY,
  profileIncrement,
} from '@vaquita/shared';

const depositsSumsCache: { [key: string]: number } = {};
const fun = async () => {
  const keyTime = `increment profiles data (${Date.now()})`;
  console.time(keyTime);
  const { data: profiles = [] } = await getCachedProfiles();
  for (const profile of profiles) {
    const {
      data: deposits = [],
      cached,
    } = await getCachedDepositsByNetworkIdWalletAddress(profile.network_id, profile.wallet_address);
    let sum = 0;
    const timestamp = Date.now();
    const key = `${profile.network_id}_${profile.wallet_address}`;
    if (cached && typeof depositsSumsCache[key] === 'number') {
      sum = depositsSumsCache[key];
    } else {
      for (const deposit of deposits) {
        if (deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS) {
          sum += deposit.amount || 0;
        }
      }
      depositsSumsCache[key] = sum;
    }

    const { data, error } = await getCachedProfilesDepositsByProfileId(profile.id);

    const totalActiveDeposits = data?.total_active_deposits || [];
    if (!data || error) {
      await createProfilesDepositsByProfileId(profile.id);
    }
    totalActiveDeposits.push(sum);

    await profileIncrement(profile.id, totalActiveDeposits, 1, timestamp);
  }
  console.timeEnd(keyTime);
};

const safeFun = async () => {
  try {
    await fun();
  } catch (error) {
    console.error('Error en job-deposits-history:', error);
  }
};

const job = async () => {
  await safeFun();
  setInterval(safeFun, HISTORICAL_DELAY);
};

void job();

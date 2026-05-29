import { useMemo } from 'react';
import { DepositWithdrawalState, VaquitaMood } from '../types';
import { useDeposits } from './useDeposits';
import { useProfileDailyCheck } from './profile';

export interface VaquitaMoodInfo {
  mood: VaquitaMood;
  canCollect: boolean;
  goldCoinsToCollect: number;
}

export const useVaquitaMood = (): VaquitaMoodInfo => {
  const { data: dailyCheck } = useProfileDailyCheck();
  const { data: depositsData } = useDeposits();

  return useMemo(() => {
    const goldCoinsToCollect = dailyCheck?.find?.((r) => r?.name === 'Gold Coin')?.amountToCollect ?? 0;
    const canCollect = goldCoinsToCollect > 0;

    const deposits = depositsData?.deposits ?? [];
    const depositReachedGoal = deposits.some(
      (d) => d.state === DepositWithdrawalState.DEPOSIT_SUCCESS && d.inLockPeriod === false,
    );
    const recentEarlyWithdraw = deposits.some(
      (d) => d.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY,
    );

    let mood: VaquitaMood = 'normal';
    if (canCollect) mood = 'happy';
    else if (depositReachedGoal) mood = 'celebrating';
    else if (recentEarlyWithdraw) mood = 'sad';

    return { mood, canCollect, goldCoinsToCollect };
  }, [dailyCheck, depositsData]);
};

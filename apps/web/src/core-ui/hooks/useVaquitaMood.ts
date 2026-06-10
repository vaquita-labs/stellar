import { useMemo } from 'react';
import { DepositResponseDTO, DepositWithdrawalState, VaquitaMood } from '../types';
import { useDepositsComplete } from './useDepositsComplete';
import { useProfileDailyCheck } from './profile';

export interface VaquitaMoodInfo {
  mood: VaquitaMood;
  canCollect: boolean;
  goldCoinsToCollect: number;
  experienceToCollect: number;
}

/** States that count as a user "action" the mood reflects (deposit / withdraw). */
const MOOD_EVENT_STATES = new Set<DepositWithdrawalState>([
  DepositWithdrawalState.DEPOSIT_SUCCESS,
  DepositWithdrawalState.WITHDRAW_SUCCESS,
  DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY,
]);

/**
 * When a deposit was last touched. A withdrawal updates its parent row without
 * minting a new id, so we take the latest of the row's own timestamps and any
 * nested withdrawal timestamps to rank events by true recency.
 */
const eventTime = (d: DepositResponseDTO): number => {
  const withdrawalTimes = (d.withdrawals ?? []).map(
    (w) => w.confirmedTimestamp || w.updatedTimestamp || w.createdTimestamp || 0,
  );
  return Math.max(
    d.updatedTimestamp || 0,
    d.confirmedTimestamp || 0,
    d.createdTimestamp || 0,
    0,
    ...withdrawalTimes,
  );
};

export const useVaquitaMood = (): VaquitaMoodInfo => {
  const { data: dailyCheck } = useProfileDailyCheck();
  const { data: depositsData } = useDepositsComplete();

  return useMemo(() => {
    const goldCoinsToCollect = dailyCheck?.find?.((r) => r?.name === 'Gold Coin')?.amountToCollect ?? 0;
    const experienceToCollect = dailyCheck?.find?.((r) => r?.name === 'Experience')?.amountToCollect ?? 0;
    const canCollect = goldCoinsToCollect > 0;

    const deposits = depositsData?.deposits ?? [];

    // A matured deposit (lock period over) is ready to withdraw with its full
    // gains — that counts as "you reached your goal".
    const depositReachedGoal = deposits.some(
      (d) => d.state === DepositWithdrawalState.DEPOSIT_SUCCESS && d.inLockPeriod === false,
    );

    // The mood follows the most recent action, so it lingers until the next
    // deposit/withdraw instead of getting stuck on an old early withdrawal.
    const lastEvent = deposits
      .filter((d) => MOOD_EVENT_STATES.has(d.state))
      .reduce<DepositResponseDTO | null>(
        (latest, d) => (!latest || eventTime(d) > eventTime(latest) ? d : latest),
        null,
      );

    let mood: VaquitaMood = 'normal';
    if (lastEvent?.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY) mood = 'sad';
    else if (lastEvent?.state === DepositWithdrawalState.WITHDRAW_SUCCESS) mood = 'excited';
    // A standing deposit means active savings — "loved".
    else if (lastEvent?.state === DepositWithdrawalState.DEPOSIT_SUCCESS) mood = 'loved';

    // Overrides, lowest to highest priority: reaching a goal and a claimable
    // daily reward are both celebratory moments — the vaquita gets "excited".
    if (depositReachedGoal) mood = 'excited';
    if (canCollect) mood = 'excited';

    return { mood, canCollect, goldCoinsToCollect, experienceToCollect };
  }, [dailyCheck, depositsData]);
};

import { formatTime, formatTimeDeposit } from '@/core-ui/helpers';
import { useMemo } from 'react';
import { DepositResponseDTO } from '../types';

interface WithdrawalTimeInfo {
  canWithdraw: boolean;
  timeRemaining: number;
  timeRemainingFormatted: string;
  lockPeriod: number;
  lockPeriodFormatted: string;
  progress: number; // 0-100
}

export const useWithdrawalTime = (vaquita: DepositResponseDTO): WithdrawalTimeInfo => {
  return useMemo(() => {
    // `serverTimestamp` queda congelado al momento del fetch (la lista se
    // cachea con staleTime Infinity); si sabemos cuándo se fetcheó, sumamos el
    // tiempo transcurrido en el cliente para obtener el "ahora" real. Sin
    // `fetchedAtTimestamp` (tutorial/simulado) se usa tal cual, como antes.
    const currentTime = vaquita.fetchedAtTimestamp
      ? vaquita.serverTimestamp + (Date.now() - vaquita.fetchedAtTimestamp)
      : vaquita.serverTimestamp;
    const finalizationTime = vaquita.createdTimestamp + vaquita.lockPeriod;
    const timeRemaining = Math.floor(Math.max(0, finalizationTime - currentTime) / 1000);
    const canWithdraw = timeRemaining === 0;
    const lockPeriodInSeconds = Math.floor(vaquita.lockPeriod / 1000);
    const elapsed = lockPeriodInSeconds - timeRemaining;
    const progress = Math.min(100, Math.max(0, (elapsed / lockPeriodInSeconds) * 100));
    return {
      canWithdraw,
      timeRemaining,
      timeRemainingFormatted: formatTime(timeRemaining),
      lockPeriod: vaquita.lockPeriod,
      lockPeriodFormatted: formatTimeDeposit(vaquita.lockPeriod),
      progress,
    };
  }, [vaquita.createdTimestamp, vaquita.lockPeriod, vaquita.serverTimestamp, vaquita.fetchedAtTimestamp]);
};

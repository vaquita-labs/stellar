import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { getDepositsData } from '../helpers/deposits';
import { useConfigStore } from '../stores';
import { useDepositsComplete } from './useDepositsComplete';

/**
 * The "Positions" chip of the withdraw flows: how much sits in active locked
 * positions, and a tap that leaves the modal for the positions list, where the
 * actual withdrawal happens. Uses the deposits query the home already holds.
 */
export const usePositionsChip = (onClose: () => void) => {
  const router = useRouter();
  const { walletAddress } = useConfigStore();
  const { data } = useDepositsComplete(walletAddress);
  const amount = useMemo(() => getDepositsData(data?.deposits ?? []).activeDepositsTotalAmount, [data]);
  return {
    amount,
    onPress: () => {
      onClose();
      router.push('/portafolio?period=all');
    },
  };
};

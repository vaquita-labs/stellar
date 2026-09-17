import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { getDepositsData } from '../helpers/deposits';
import { useConfigStore } from '../stores';
import { useDepositsComplete } from './useDepositsComplete';

/**
 * The "Positions" chip of the withdraw flows: how much sits in active locked
 * positions, and a tap that opens the positions list, where the actual
 * withdrawal happens. Uses the deposits query the home already holds.
 *
 * The withdraw modal stays open underneath on purpose: /portafolio is an
 * overlay that keeps /home mounted, so the browser's back lands on the modal
 * exactly as the user left it (method, country, destination).
 */
export const usePositionsChip = () => {
  const router = useRouter();
  const { walletAddress } = useConfigStore();
  const { data } = useDepositsComplete(walletAddress);
  const amount = useMemo(() => getDepositsData(data?.deposits ?? []).activeDepositsTotalAmount, [data]);
  return {
    amount,
    onPress: () => router.push('/portafolio?period=all'),
  };
};

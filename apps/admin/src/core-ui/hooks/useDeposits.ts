import { ONE_MINUTE } from '@/core-ui/config/constants';
import { useQuery } from '@tanstack/react-query';
import { clientEnv } from '../config/clientEnv';
import { useNetworkConfigStore } from '../stores';
import { DepositSummaryResponseDTO } from '../types';

export const useDeposits = (_walletAddress?: string) => {
  const { walletAddress: userWalletAddress, network } = useNetworkConfigStore();

  const walletAddress = _walletAddress ?? userWalletAddress;

  return useQuery<{ deposits: DepositSummaryResponseDTO[] } | null>({
    queryKey: ['deposit', 'network', network?.name, 'wallet', walletAddress],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/network/${network?.name}/wallet/${walletAddress}`
        );

        const data = await response.json();

        const deposits = ((data?.data?.deposits ?? []) as DepositSummaryResponseDTO[]).map((deposit) => {
          const data: DepositSummaryResponseDTO = {
            amount: deposit.amount,
            state: deposit.state,
            id: deposit.id,
            tokenSymbol: deposit.tokenSymbol,
            inLockPeriod: deposit.inLockPeriod,
            lockPeriod: deposit.lockPeriod,
            vaquitaContractAddress: deposit.vaquitaContractAddress ?? '',
            totalDeposits: deposit.totalDeposits,
          };
          return data;
        });
        return {
          deposits,
        };
      } catch (error) {
        console.error('useDeposits', error);
        return {
          deposits: [],
          totals: {},
        };
      }
    },
    refetchInterval: ONE_MINUTE * 5,
    enabled: !!network?.name && !!walletAddress,
  });
};

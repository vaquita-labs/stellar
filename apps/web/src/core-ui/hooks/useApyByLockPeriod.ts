import { clientEnv } from '@/core-ui/config/clientEnv';
import { ONE_MINUTE } from '@/core-ui/config/constants';
import { useQuery } from '@tanstack/react-query';
import { useNetworkConfigStore } from '../stores';

export const useApyByLockPeriod = (lockPeriod: number, tokenSymbol: string) => {
  const { network } = useNetworkConfigStore();

  return useQuery<{
    protocolApy: number;
    vaquitaApy: number;
    lendingMarketName: string;
    rewardPool: number;
    totalDeposits: number;
    interestModelNote?: string;
  } | null>({
    queryKey: ['deposit', 'network', network?.name, 'token', tokenSymbol, 'lockPeriod', lockPeriod, 'apy'],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/network/${network?.name}/token/${tokenSymbol}/lockPeriod/${lockPeriod}/apy`
        );

        const data = await response.json();

        return {
          protocolApy: data?.data?.protocolApy ?? 0,
          vaquitaApy: data?.data?.vaquitaApy ?? 0,
          lendingMarketName: data?.data?.lendingMarketName ?? '',
          rewardPool: data?.data?.rewardPool ?? 0,
          totalDeposits: data?.data?.totalDeposits ?? 0,
          interestModelNote: typeof data?.data?.interestModelNote === 'string' ? data.data.interestModelNote : undefined,
        };
      } catch (error) {
        console.error('useDepositsApy', error);
        return {
          protocolApy: 0,
          vaquitaApy: 0,
          lendingMarketName: '',
          rewardPool: 0,
          totalDeposits: 0,
          interestModelNote: undefined,
        };
      }
    },
    refetchInterval: ONE_MINUTE * 5,
    enabled: !!network?.name && lockPeriod > 0,
  });
};

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { RewardResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileDailyCheck = () => {
  const { network, walletAddress } = useConfigStore();
  return useQuery<RewardResponseDTO[]>({
    queryKey: ['profile', network?.networkName, walletAddress, 'daily-check'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${network?.networkName}/wallet/${walletAddress}/daily-check`
      );

      const data = await response.json();

      const rewards: RewardResponseDTO[] = (data?.data || []).map((reward: RewardResponseDTO) => ({
        name: reward?.name || '',
        amountToCollect: reward?.amountToCollect || 0,
        amount: reward?.amount || 0,
      }));

      return rewards;
    },
    enabled: !!network?.networkName && !!walletAddress,
  });
};

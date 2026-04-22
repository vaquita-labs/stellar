import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { ProfileRewardsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileRewards = () => {
  const { network, walletAddress } = useNetworkConfigStore();
  return useQuery<ProfileRewardsResponseDTO>({
    queryKey: ['profile', network?.name, walletAddress, 'profile-rewards'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${network?.name}/wallet/${walletAddress}/rewards`
      );
      const data = await response.json();

      const profile: ProfileRewardsResponseDTO = {
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        rewards: (data?.data?.rewards || []).map((reward: ProfileRewardsResponseDTO['rewards'][number]) => ({
          name: reward?.name || '',
          amount: reward?.amount || 0,
        })),
      };

      return profile;
    },
    enabled: !!network?.name && !!walletAddress,
  });
};

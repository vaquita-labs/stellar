import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { ProfileRewardsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileRewards = () => {
  const { network, walletAddress } = useConfigStore();
  return useQuery<ProfileRewardsResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'profile-rewards'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/rewards`
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
    enabled: !!network?.networkName && !!walletAddress,
  });
};

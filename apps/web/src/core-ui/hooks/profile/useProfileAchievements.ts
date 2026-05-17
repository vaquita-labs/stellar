import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import type { ProfileAchievementsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileAchievements = () => {
  const { network, walletAddress } = useNetworkConfigStore();
  return useQuery<ProfileAchievementsResponseDTO>({
    queryKey: ['profile', network?.name, walletAddress, 'profile-achievements'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${network?.name}/wallet/${walletAddress}/achievements`,
      );
      const data = await response.json();

      const dto: ProfileAchievementsResponseDTO = {
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        achievements: Array.isArray(data?.data?.achievements) ? data.data.achievements : [],
      };

      return dto;
    },
    enabled: !!network?.name && !!walletAddress,
  });
};

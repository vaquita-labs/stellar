import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { ProfileStreakResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileStreak = () => {
  const { network, walletAddress } = useConfigStore();
  return useQuery<ProfileStreakResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'profile-streak'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${network?.networkName}/wallet/${walletAddress}/streak`
      );
      const data = await response.json();

      const profile: ProfileStreakResponseDTO = {
        networkName: data?.data?.networkName ?? '',
        walletAddress: data?.data?.walletAddress ?? '',
        yesterdayStreak: data?.data?.yesterdayStreak || 0,
        todayStreak: data?.data?.todayStreak || false,
        days: data?.data?.days || [],
      };

      return profile;
    },
    enabled: !!network?.networkName && !!walletAddress,
  });
};

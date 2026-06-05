import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { ProfileResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileData = () => {
  const { network, walletAddress } = useConfigStore();
  return useQuery<ProfileResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'profile-data'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/data`
      );
      const data = await response.json();

      const profile: ProfileResponseDTO = {
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        email: data?.data?.email || '',
        fullName: data?.data?.fullName || '',
        nickname: data?.data?.nickname || '',
        avatarUrl: data?.data?.avatarUrl || '',
        onboardingCompleted: data?.data?.onboardingCompleted ?? false,
        tutorialCompleted: data?.data?.tutorialCompleted ?? false,
        cryptoSavvy: data?.data?.cryptoSavvy ?? false,
      };

      return profile;
    },
    enabled: !!network?.networkName && !!walletAddress,
  });
};

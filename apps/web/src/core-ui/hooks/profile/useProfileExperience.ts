import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { ProfileExperienceResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileExperience = () => {
  const { network, walletAddress } = useNetworkConfigStore();
  return useQuery<ProfileExperienceResponseDTO>({
    queryKey: ['profile', network?.name, walletAddress, 'profile-experience'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${network?.name}/wallet/${walletAddress}/experience`
      );
      const data = await response.json();

      const profile: ProfileExperienceResponseDTO = {
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        experience: data?.data?.experience || 0,
      };

      return profile;
    },
    enabled: !!network?.name && !!walletAddress,
  });
};

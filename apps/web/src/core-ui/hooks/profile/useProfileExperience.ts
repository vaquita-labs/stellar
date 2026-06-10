import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { ProfileExperienceResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

/** Pass a wallet to read another user's XP (e.g. the leaderboard detail
 *  view); defaults to the connected wallet. */
export const useProfileExperience = (walletAddressOverride?: string) => {
  const { network, walletAddress: connectedWallet } = useConfigStore();
  const walletAddress = walletAddressOverride ?? connectedWallet;
  return useQuery<ProfileExperienceResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'profile-experience'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/experience`
      );
      const data = await response.json();

      const profile: ProfileExperienceResponseDTO = {
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        experience: data?.data?.experience || 0,
      };

      return profile;
    },
    enabled: !!network?.networkName && !!walletAddress,
  });
};

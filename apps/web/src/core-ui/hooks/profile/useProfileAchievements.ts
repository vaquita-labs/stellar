import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import type { ProfileAchievementsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

/** Pass a wallet to read another user's badges (e.g. the leaderboard detail
 *  view); defaults to the connected wallet. */
export const useProfileAchievements = (walletAddressOverride?: string) => {
  const { network, walletAddress: connectedWallet } = useConfigStore();
  const walletAddress = walletAddressOverride ?? connectedWallet;
  return useQuery<ProfileAchievementsResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'profile-achievements'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/wallets/${walletAddress}/badges`,
      );
      const data = await response.json();

      const dto: ProfileAchievementsResponseDTO = {
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        achievements: Array.isArray(data?.data?.achievements) ? data.data.achievements : [],
      };

      return dto;
    },
    enabled: !!network?.networkName && !!walletAddress,
  });
};

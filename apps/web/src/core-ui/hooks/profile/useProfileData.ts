import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { DEFAULT_NOTIFICATION_PREFERENCES, ProfileResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

/** Pass a wallet to read another user's profile (e.g. the leaderboard detail
 *  view); defaults to the connected wallet. Query keys match either way, so
 *  the cache is shared with the own-profile reads. */
export const useProfileData = (walletAddressOverride?: string) => {
  const { network, walletAddress: connectedWallet } = useConfigStore();
  const walletAddress = walletAddressOverride ?? connectedWallet;
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
        language: data?.data?.language ?? '',
        currency: data?.data?.currency ?? '',
        notificationPreferences: {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...(data?.data?.notificationPreferences ?? {}),
        },
        createdAt: data?.data?.createdAt ?? '',
      };

      return profile;
    },
    enabled: !!network?.networkName && !!walletAddress,
  });
};

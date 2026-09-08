import { resolveAvatarConfig } from '@vaquita/avatar';
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
        // Sólo este endpoint lo trae; queda `undefined` en el resto.
        id: data?.data?.id || undefined,
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        email: data?.data?.email || '',
        fullName: data?.data?.fullName || '',
        nickname: data?.data?.nickname || '',
        avatarConfig: resolveAvatarConfig(data?.data?.avatarConfig, data?.data?.walletAddress || walletAddress || ''),
        onboardingCompleted: data?.data?.onboardingCompleted ?? false,
        tutorialCompleted: data?.data?.tutorialCompleted ?? false,
        homeTourCompleted: data?.data?.homeTourCompleted ?? false,
        cryptoSavvy: data?.data?.cryptoSavvy ?? false,
        language: data?.data?.language ?? '',
        currency: data?.data?.currency ?? '',
        notificationPreferences: {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...(data?.data?.notificationPreferences ?? {}),
        },
        // `''` when never accepted, or when the read failed server-side: both
        // must re-show the gate rather than wave the user through.
        legalAcceptedVersion: data?.data?.legalAcceptedVersion ?? '',
        createdAt: data?.data?.createdAt ?? '',
      };

      return profile;
    },
    enabled: !!network?.networkName && !!walletAddress,
    // Show the persisted profile instantly, but revalidate on mount / focus /
    // reconnect so values changed in the backend replace the stale cache
    // (overrides the global staleTime: Infinity + refetch* false defaults).
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
};

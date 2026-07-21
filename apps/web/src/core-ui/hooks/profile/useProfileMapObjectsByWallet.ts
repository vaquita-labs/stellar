import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { MapObjectType, ProfileMapObjectsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

/**
 * Fetch the placed map objects for an *arbitrary* wallet (not just the logged-in
 * user). Used to assemble each player's mini-map preview in the leaderboard.
 *
 * Keyed per wallet, so React Query caches + dedupes across the many cards that
 * may request the same address. Pass `enabled = false` (e.g. while the card is
 * off-screen) to skip the request entirely until it matters.
 */
export const useProfileMapObjectsByWallet = (walletAddress?: string, enabled = true) => {
  const { network } = useConfigStore();

  return useQuery<ProfileMapObjectsResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'profile-map-objects'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/map-objects`
      );
      const data = await response.json();

      const profile: ProfileMapObjectsResponseDTO = {
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        objects: (data?.data?.objects || []).map(
          (object: ProfileMapObjectsResponseDTO['objects'][number]) => ({
            type: object?.type || MapObjectType.EMPTY,
            variant: object?.variant || 0,
            position: object?.position || [0, 0, 0],
            // Sin esto las rotaciones guardadas (edificios girados en modo
            // edición) se perdían en cada recarga del mapa.
            rotation: object?.rotation || [0, 0, 0],
          })
        ),
      };

      return profile;
    },
    enabled: enabled && !!network?.networkName && !!walletAddress,
    // Other players edit their maps without anything invalidating OUR cache,
    // so the global staleTime: Infinity (+ localStorage persistence) served
    // previews frozen at whenever the wallet was first cached. Serve the
    // cached copy instantly but revalidate after 5 minutes so the board
    // catches up on its own.
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
  });
};

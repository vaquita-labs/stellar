import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { MapObjectType, ProfileMapObjectsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileMapObjects = () => {
  const { network, walletAddress } = useNetworkConfigStore();
  return useQuery<ProfileMapObjectsResponseDTO>({
    queryKey: ['profile', network?.name, walletAddress, 'profile-map-objects'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${network?.name}/wallet/${walletAddress}/map-objects`
      );
      const data = await response.json();

      const profile: ProfileMapObjectsResponseDTO = {
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        objects: (data?.data?.objects || []).map((object: ProfileMapObjectsResponseDTO['objects'][number]) => ({
          type: object?.type || MapObjectType.EMPTY,
          variant: object?.variant || 0,
          position: object?.position || [0, 0, 0],
        })),
      };

      return profile;
    },
    enabled: !!network?.name && !!walletAddress,
  });
};

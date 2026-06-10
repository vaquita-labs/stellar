import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { MapObjectType, ProfileMapObjectsAvailableResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileMapObjectsAvailable = () => {
  const { network, walletAddress } = useConfigStore();
  return useQuery<ProfileMapObjectsAvailableResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'profile-map-objects-available'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/map-objects-available`
      );
      const data = await response.json();

      const profile: ProfileMapObjectsAvailableResponseDTO = {
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        objects: (data?.data?.objects || []).map(
          (object: ProfileMapObjectsAvailableResponseDTO['objects'][number]) => ({
            price: object?.price || 0,
            itemsAvailable: object?.itemsAvailable || 0,
            type: object?.type || MapObjectType.EMPTY,
            variant: object?.variant || 0,
          })
        ),
      };

      return profile;
    },
    enabled: !!network?.networkName && !!walletAddress,
    // Precios/stock de la tienda se editan desde el admin: refetch al montar
    // para reflejar esos cambios sin esperar a una compra.
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

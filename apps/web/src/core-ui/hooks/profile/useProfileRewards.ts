import { clientEnv } from '@/core-ui/config/clientEnv';
import { LIVE_QUERY_OPTIONS } from '@/core-ui/config/queryFreshness';
import { useConfigStore } from '@/core-ui/stores';
import { ProfileRewardsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileRewards = () => {
  const { network, walletAddress } = useConfigStore();
  return useQuery<ProfileRewardsResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'profile-rewards'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/rewards`
      );
      const data = await response.json();

      const profile: ProfileRewardsResponseDTO = {
        networkName: data?.data?.networkName || '',
        walletAddress: data?.data?.walletAddress || '',
        rewards: (data?.data?.rewards || []).map((reward: ProfileRewardsResponseDTO['rewards'][number]) => ({
          name: reward?.name || '',
          amount: reward?.amount || 0,
        })),
      };

      return profile;
    },
    enabled: !!network?.networkName && !!walletAddress,
    // El total de monedas lo lleva el server sumando el ledger entero
    // (`profiles_rewards`): el check-in diario, los logros, los depósitos y las
    // compras de la tienda. Con el default global (un día de frescura +
    // `refetchOnMount: false` + persistencia en localStorage) el header se
    // pintaba desde el snapshot de localStorage y NUNCA preguntaba: el usuario
    // abría el cofre, veía subir las monedas por la invalidación, y al recargar
    // volvía al número viejo. Sus tres hermanas del check-in
    // (`useProfileDailyCheck`, `useProfileStreak`, `useProfileExperience`) ya
    // revalidaban al montar; esta era la única que no, y por eso era la única
    // cifra que parecía retroceder. Se revalida al montar, al volver el foco y
    // al reconectar, mostrando el valor persistido mientras corre el refetch.
    ...LIVE_QUERY_OPTIONS,
  });
};

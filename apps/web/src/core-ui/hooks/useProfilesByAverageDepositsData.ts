import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { ProfileAverageResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';
import { ONE_MINUTE } from '../config/constants';

export const useProfilesByAverageDepositsData = () => {
  const { network } = useConfigStore();
  return useQuery<ProfileAverageResponseDTO[]>({
    queryKey: ['profiles', 'network', network?.networkName, 'by-average-deposits'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/by-average-deposits`
      );
      const data = await response.json();

      return (data?.data ?? []).map((profile: ProfileAverageResponseDTO) => {
        const p: ProfileAverageResponseDTO = {
          email: profile?.email ?? '',
          fullName: profile?.fullName ?? '',
          nickname: profile?.nickname ?? '',
          walletAddress: profile?.walletAddress ?? '',
          totalSums: profile?.totalSums ?? 0,
          lastSum: profile?.lastSum ?? 0,
          count: profile?.count ?? 0,
          timestamp: profile?.timestamp ?? 0,
          delay: profile?.delay ?? 0,
          badges: profile?.badges ?? 0,
        };

        return p;
      });
    },
    refetchInterval: ONE_MINUTE * 5,
    enabled: !!network?.networkName,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
};

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { ProfileAverageResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';
import { ONE_MINUTE } from '../config/constants';

export const useProfilesByAverageDepositsData = () => {
  const { network } = useNetworkConfigStore();
  return useQuery<ProfileAverageResponseDTO[]>({
    queryKey: ['profiles', 'network', network?.name, 'by-average-deposits'],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${network?.name}/by-average-deposits`
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
        };

        return p;
      });
    },
    refetchInterval: ONE_MINUTE * 5,
    enabled: !!network?.name,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
};

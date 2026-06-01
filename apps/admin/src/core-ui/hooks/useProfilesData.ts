import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { ProfileResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';
import { ONE_MINUTE } from '../config/constants';

export const useProfilesData = () => {
  const { network } = useNetworkConfigStore();
  return useQuery<ProfileResponseDTO[]>({
    queryKey: ['profiles', 'network', network?.name],
    queryFn: async () => {
      const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${network?.name}`);
      const data = await response.json();

      return (data?.data ?? []).map((profile: ProfileResponseDTO) => {
        const p: ProfileResponseDTO = {
          email: profile?.email ?? '',
          fullName: profile?.fullName ?? '',
          nickname: profile?.nickname ?? '',
          walletAddress: profile?.walletAddress ?? '',
          experience: profile?.experience ?? 0,
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

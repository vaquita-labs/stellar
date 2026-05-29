import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { ProfileResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useProfileData = () => {
  const { network, walletAddress } = useNetworkConfigStore();
  return useQuery<ProfileResponseDTO>({
    queryKey: ['profile', network?.name, walletAddress],
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${network?.name}/wallet/${walletAddress}`
      );
      const data = await response.json();

      return {
        email: data?.data?.email ?? '',
        fullName: data?.data?.full_name ?? '',
        nickname: data?.data?.nickname ?? '',
        walletAddress: data?.data?.wallet_address ?? '',
        experience: data?.data?.experience ?? 0,
      };
    },
    enabled: !!network?.name && !!walletAddress,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
};

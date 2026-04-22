import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO, TotalDepositsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useAdminDeposits = () => {
  const { network } = useNetworkConfigStore();

  return useQuery<{ deposits: DepositResponseDTO[]; totals: TotalDepositsResponseDTO } | null>({
    queryKey: ['deposit', 'admin', 'network', network?.name, 'complete'],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/admin/network/${network?.name}/complete`
        );

        const data = await response.json();

        return data.data ?? {};
      } catch (error) {
        console.error('useDeposits', error);
        return {
          deposits: [],
          totals: {},
        };
      }
    },
    enabled: !!network?.name,
  });
};

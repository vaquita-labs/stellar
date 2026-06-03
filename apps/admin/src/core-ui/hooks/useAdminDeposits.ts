import { clientEnv } from '@/core-ui/config/clientEnv';
import { DepositResponseDTO, TotalDepositsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

// TODO(single-network): admin is Stellar-only now. Hardcoded so this no longer
// depends on the network resolved from /api/v1/network. Move to project-config
// once the backend exposes it. Must match a `networks.name` row the API knows.
const NETWORK_NAME = 'Stellar Testnet';

export const useAdminDeposits = () => {
  return useQuery<{ deposits: DepositResponseDTO[]; totals: TotalDepositsResponseDTO } | null>({
    queryKey: ['deposit', 'admin', 'network', NETWORK_NAME, 'complete'],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/admin/network/${NETWORK_NAME}/complete`
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
  });
};
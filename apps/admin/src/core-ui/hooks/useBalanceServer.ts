import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';

export const useBalanceServer = (walletAddress: string) => {
  return useQuery<{
    balances: { balance: number; networkName: string; tokenSymbol: string }[];
    wallet: { walletAddress: string };
  }>({
    queryKey: ['user', 'balance-server'],
    queryFn: async () => {
      try {
        const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/user/balance-server`);

        const data = await response.json();

        return data.data ?? {};
      } catch (error) {
        console.error('useServerBalance', error);
        return {};
      }
    },
    enabled: !!walletAddress,
  });
};

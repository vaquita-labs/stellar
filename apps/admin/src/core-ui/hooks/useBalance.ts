import { clientEnv } from '@/core-ui/config/clientEnv';
import { UserBalanceResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export const useBalance = (walletAddress: string) => {
  return useQuery<UserBalanceResponseDTO>({
    queryKey: ['user', 'balance', 'wallet', walletAddress],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/user/balance/wallet/${walletAddress}`
        );

        const data = await response.json();
        const responseData: UserBalanceResponseDTO = {
          wallet: { walletAddress: data?.data?.wallet?.walletAddress ?? '' },
          balances: (data?.data?.balances ?? []).map((balance: UserBalanceResponseDTO['balances'][number]) => ({
            balance: balance?.balance ?? 0,
            networkName: balance?.networkName ?? '',
            tokenSymbol: balance?.tokenSymbol ?? '',
          })),
        };
        return responseData;
      } catch (error) {
        console.error('error on useBalance', error);
        return {
          wallet: { walletAddress: '' },
          balances: [],
        };
      }
    },
    enabled: !!walletAddress,
  });
};

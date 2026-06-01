import { useQuery } from '@tanstack/react-query';
import { clientEnv } from '../config/clientEnv';
import { ONE_MINUTE } from '../config/constants';
import { useNetworkConfigStore } from '../stores';
import { DepositResponseDTO, TotalDepositsResponseDTO } from '../types';

export const useDepositsComplete = (_walletAddress?: string) => {
  const { walletAddress: userWalletAddress, network } = useNetworkConfigStore();

  const walletAddress = _walletAddress ?? userWalletAddress;

  return useQuery<{ deposits: DepositResponseDTO[]; totals: TotalDepositsResponseDTO } | null>({
    queryKey: ['deposit', 'network', network?.name, 'wallet', walletAddress, 'complete'],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/network/${network?.name}/wallet/${walletAddress}/complete`
        );

        const data = await response.json();

        const deposits = ((data?.data?.deposits ?? []) as DepositResponseDTO[]).map((deposit) => {
          const data: DepositResponseDTO = {
            transactionHash: deposit.transactionHash,
            amount: deposit.amount,
            tokenSymbol: deposit.tokenSymbol,
            status: deposit.status,
            state: deposit.state,
            id: deposit.id,
            vaquitaContractAddress: deposit.vaquitaContractAddress,
            vaquitaInterest: Number(deposit.vaquitaInterest),
            aaveInterest: Number(deposit.aaveInterest),
            blendInterest: Number(deposit.blendInterest),
            depositIdHex: deposit.depositIdHex,
            withdrawals: deposit.withdrawals || null,
            createdTimestamp: deposit.createdTimestamp || 0,
            walletAddress: deposit.walletAddress,
            updatedTimestamp: deposit.updatedTimestamp || 0,
            lockPeriod: deposit.lockPeriod || 0,
            serverTimestamp: deposit.serverTimestamp || 0,
            confirmedTimestamp: deposit.confirmedTimestamp || 0,
            inLockPeriod: deposit.inLockPeriod,
            totalDeposits: deposit.totalDeposits || 0,
          };
          return data;
        });
        return {
          deposits,
          totals: data?.data?.totals,
        };
      } catch (error) {
        console.error('error on useDepositsComplete', error);
        return {
          deposits: [],
          totals: {},
        };
      }
    },
    refetchInterval: ONE_MINUTE * 5,
    enabled: !!network?.name && !!walletAddress,
  });
};

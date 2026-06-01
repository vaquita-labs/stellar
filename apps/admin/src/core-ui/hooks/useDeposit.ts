import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';
import { DepositResponseDTO } from '../types';
import { useNetworkConfigStore } from '../stores';
import { useApyByLockPeriod } from './useApyByLockPeriod';

export const useDeposit = (depositId: number) => {
  const { network, lockPeriod, token } = useNetworkConfigStore();
  const { data: dataApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');

  return useQuery<DepositResponseDTO | null>({
    queryKey: ['deposit', depositId],
    queryFn: async () => {
      try {
        const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/${depositId}`);

        const data = await response.json();

        const isStellarTestnet = network?.name === 'Stellar Testnet';
        const depositAmount = data?.data?.amount;
        const protocolApy = dataApy?.protocolApy ?? 0;
        const vaquitaApy = dataApy?.vaquitaApy ?? 0;
        const protocolApyMultiplier = protocolApy / 100;
        const vaquitaApyMultiplier = vaquitaApy / 100;
        const lockPeriodInMilSeconds = lockPeriod;
        const lockPeriodInYears = lockPeriodInMilSeconds / 12 / 30 / 24 / 60 / 60 / 1000;
        const aaveInterest = !isStellarTestnet ? depositAmount * (protocolApyMultiplier * lockPeriodInYears) : 0;
        const blendInterest = isStellarTestnet ? depositAmount * (protocolApyMultiplier * lockPeriodInYears) : 0;
        const vaquitaInterest = depositAmount * (vaquitaApyMultiplier * lockPeriodInYears);
        const vaquitaReward = aaveInterest + vaquitaInterest + blendInterest;

        const deposit: DepositResponseDTO = {
          transactionHash: data?.data.transactionHash,
          amount: data?.data?.amount,
          tokenSymbol: data?.data?.tokenSymbol,
          status: data?.data?.status,
          state: data?.data?.state,
          id: data?.data?.id,
          vaquitaContractAddress: data?.data?.vaquitaContractAddress || data?.data?.contractAddress,
          vaquitaInterest: Number(data?.data?.vaquitaInterest),
          aaveInterest: Number(data?.data?.aaveInterest),
          blendInterest: Number(data?.data?.blendInterest),
          depositIdHex: data?.data?.depositIdHex,
          withdrawals: data?.data?.withdrawals || null,
          createdTimestamp: data?.data?.createdTimestamp || 0,
          walletAddress: data?.data?.walletAddress,
          updatedTimestamp: data?.data?.updatedTimestamp || 0,
          lockPeriod: data?.data?.lockPeriod || 0,
          serverTimestamp: data?.data?.serverTimestamp || 0,
          confirmedTimestamp: data?.data?.confirmedTimestamp || 0,
          inLockPeriod: data?.data?.inLockPeriod || 0,
          totalDeposits: data?.data?.totalDeposits || 0,
        };
        return deposit;
      } catch (error) {
        console.error('useDeposits', error);
        return null;
      }
    },
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: 400,
    enabled: !!depositId,
  });
};

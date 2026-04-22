import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { useCallback } from 'react';

export const useRestDeposit = () => {
  const { walletAddress, network } = useNetworkConfigStore();

  const createDeposit = useCallback(
    async (payload: { amount: number; tokenSymbol: string; lockPeriod: number, vaquitaContract: string }) => {
      try {
        const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, networkName: network?.name, walletAddress }),
        });
        const data = await response.json();

        console.info('createDeposit', data);

        return {
          success: !!data?.data?.id && !data?.errors,
          id: (data?.data?.id ?? 0) as number,
        };
      } catch (error) {
        console.error(createDeposit, error);
        return {
          success: false,
          id: 0,
        };
      }
    },
    [network?.name, walletAddress]
  );

  const confirmDeposit = useCallback(
    async (payload: { id: number; txHash: string; depositIdHex: string; transactionRaw: string }) => {
      const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      console.info('confirm deposit data', data);
      return { success: true };
    },
    []
  );

  const failDeposit = useCallback(
    async (payload: { id: number; txHash: string; depositIdHex: string; transactionRaw: string }) => {
      const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      console.info('confirm deposit data', data);
      return { success: true };
    },
    []
  );

  return {
    createDeposit,
    confirmDeposit,
    failDeposit,
  };
};

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { useCallback } from 'react';

export const useRestDeposit = () => {
  const { walletAddress, network } = useConfigStore();

  const getNextNonce = useCallback(async (): Promise<string | null> => {
    if (!walletAddress) return null;
    try {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/next-nonce/wallet/${walletAddress}`,
      );
      const data = await response.json();
      const nonce = data?.data?.nonce;
      return typeof nonce === 'string' && nonce !== '' ? nonce : null;
    } catch (error) {
      console.error('getNextNonce', error);
      return null;
    }
  }, [walletAddress]);

  const createDeposit = useCallback(
    async (payload: { amount: number; tokenSymbol: string; lockPeriod: number, vaquitaContract: string, nonce?: string }) => {
      try {
        const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, networkName: network?.networkName, walletAddress }),
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
    [network?.networkName, walletAddress]
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
    getNextNonce,
    createDeposit,
    confirmDeposit,
    failDeposit,
  };
};

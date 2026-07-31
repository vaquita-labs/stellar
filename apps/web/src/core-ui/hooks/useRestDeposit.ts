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

  /**
   * Records the confirmed deposit against its row. The server verifies the hash
   * on chain before writing, so it can refuse (409) while its RPC has not caught
   * up — the deposit itself is already on chain either way, and reconciliation
   * repairs the row from the deposit event. Reports the refusal instead of
   * claiming success so it shows up in the logs rather than nowhere.
   */
  const confirmDeposit = useCallback(
    async (payload: { id: number; txHash: string; depositIdHex: string; transactionRaw: string }) => {
      const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        console.warn('[confirmDeposit] server did not record the deposit', response.status, data);
        return { success: false };
      }
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
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        console.warn('[failDeposit] server did not record the failure', response.status, data);
        return { success: false };
      }
      console.info('fail deposit data', data);
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

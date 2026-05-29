import { clientEnv } from '@/core-ui/config/clientEnv';
import { useCallback } from 'react';

export const useRestWithdrawal = () => {
  const confirmWithdrawal = useCallback(
    async (payload: { depositId: number; txHash: string; transactionRaw: string }) => {
      const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/withdraw-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      console.info('confirmWithdrawal data', { data });
      return { success: true };
    },
    []
  );

  return {
    confirmWithdrawal,
  };
};

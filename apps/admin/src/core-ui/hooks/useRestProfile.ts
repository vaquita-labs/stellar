import { clientEnv } from '@/core-ui/config/clientEnv';
import { useCallback } from 'react';

export const useRestProfile = () => {
  const saveNickname = useCallback(
    async (networkName: string, walletAddress: string, payload: { nickname: string }) => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${networkName}/wallet/${walletAddress}/nickname`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();

      console.info('saveNickname data', { data });
      return {};
    },
    []
  );

  return {
    saveNickname,
  };
};

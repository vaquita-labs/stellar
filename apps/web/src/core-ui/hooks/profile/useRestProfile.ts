import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { ProfileMapObjectsResponseDTO } from '@/core-ui/types';
import { useCallback } from 'react';

export const useRestProfile = () => {
  const { network, walletAddress } = useConfigStore();

  const networkName = network?.networkName || '';

  const saveNickname = useCallback(
    async (payload: { nickname: string }) => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${networkName}/wallet/${walletAddress}/nickname`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();

      return {
        success: data?.status === 'success',
        message: data?.message,
      };
    },
    [networkName, walletAddress]
  );

  const checkNicknameAvailability = useCallback(
    async (nickname: string): Promise<boolean> => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${networkName}/nickname-available?nickname=${encodeURIComponent(nickname)}`
      );
      const data = await response.json();
      return data?.data?.available === true;
    },
    [networkName]
  );

  const goldDailyCollect = useCallback(async () => {
    const response = await fetch(
      `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${networkName}/wallet/${walletAddress || ''}/gold-daily-collect`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );
    const data = await response.json();

    return data;
  }, [networkName, walletAddress]);

  const saveMapObjects = useCallback(
    async (payload: { objects: ProfileMapObjectsResponseDTO['objects'] }) => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${networkName}/wallet/${walletAddress || ''}/map-objects`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();

      return data;
    },
    [networkName, walletAddress]
  );

  return {
    saveNickname,
    checkNicknameAvailability,
    goldDailyCollect,
    saveMapObjects,
  };
};

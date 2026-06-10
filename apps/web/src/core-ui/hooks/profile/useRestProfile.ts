import { clientEnv } from '@/core-ui/config/clientEnv';
import { authFetch } from '@/networks/stellar/walletSession';
import { useConfigStore } from '@/core-ui/stores';
import { NotificationPreferences, ProfileMapObjectsResponseDTO } from '@/core-ui/types';
import { useCallback } from 'react';

export const useRestProfile = () => {
  const { network, walletAddress } = useConfigStore();

  const networkName = network?.networkName || '';

  const saveNickname = useCallback(
    async (payload: { nickname: string }) => {
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/nickname`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        walletAddress
      );
      const data = await response.json();

      return {
        success: data?.status === 'success',
        message: data?.message,
      };
    },
    [networkName, walletAddress]
  );

  // Update nickname and/or email together. The API validates and saves each
  // field independently, so `result` reports a per-field `{ saved, error }`:
  // one field can succeed while the other reports a friendly error.
  const saveProfile = useCallback(
    async (payload: { nickname?: string; email?: string }) => {
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/profile`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        walletAddress
      );
      const data = await response.json();

      return {
        success: data?.status === 'success',
        message: data?.message as string | undefined,
        result: data?.data as
          | {
              nickname: { saved: boolean; error: string | null };
              email: { saved: boolean; error: string | null };
            }
          | undefined,
      };
    },
    [networkName, walletAddress]
  );

  const saveProfileFlags = useCallback(
    async (payload: { onboardingCompleted?: boolean; tutorialCompleted?: boolean; cryptoSavvy?: boolean }) => {
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/flags`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        walletAddress
      );
      const data = await response.json();

      return {
        success: data?.status === 'success',
        message: data?.message,
      };
    },
    [networkName, walletAddress]
  );

  // Persist the user's display preferences (language / currency). The API
  // validates each id against the active project config; an unknown id comes
  // back as a failure with a message.
  const saveProfilePreferences = useCallback(
    async (payload: { language?: string; currency?: string }) => {
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/preferences`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        walletAddress
      );
      const data = await response.json();

      return {
        success: data?.status === 'success',
        message: data?.message,
      };
    },
    [networkName, walletAddress]
  );

  // Persist notification toggles. Keys are merged server-side, so a single
  // toggle can be PATCHed on its own; enabling `email` fails with a friendly
  // message while the profile has no email address.
  const saveNotificationPreferences = useCallback(
    async (payload: Partial<NotificationPreferences>) => {
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/notification-preferences`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        walletAddress
      );
      const data = await response.json();

      return {
        success: data?.status === 'success',
        message: data?.message,
      };
    },
    [networkName, walletAddress]
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/avatar`,
        {
          method: 'POST',
          body: form,
        },
        walletAddress
      );
      const data = await response.json();

      return {
        success: data?.status === 'success',
        message: data?.message,
        avatarUrl: data?.data?.avatarUrl as string | undefined,
      };
    },
    [networkName, walletAddress]
  );

  const removeAvatar = useCallback(async () => {
    const response = await authFetch(
      `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/avatar`,
      {
        method: 'DELETE',
      },
      walletAddress
    );
    const data = await response.json();

    return {
      success: data?.status === 'success',
      message: data?.message,
    };
  }, [networkName, walletAddress]);

  const checkNicknameAvailability = useCallback(
    async (nickname: string): Promise<boolean> => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/nickname-available?nickname=${encodeURIComponent(nickname)}`
      );
      const data = await response.json();
      return data?.data?.available === true;
    },
    [networkName]
  );

  const goldDailyCollect = useCallback(async () => {
    const response = await authFetch(
      `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress || ''}/gold-daily-collect`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      walletAddress
    );
    const data = await response.json();

    return data;
  }, [networkName, walletAddress]);

  const saveMapObjects = useCallback(
    async (payload: { objects: ProfileMapObjectsResponseDTO['objects'] }) => {
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress || ''}/map-objects`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        walletAddress
      );
      const data = await response.json();

      return data;
    },
    [networkName, walletAddress]
  );

  return {
    saveNickname,
    saveProfile,
    saveProfileFlags,
    saveProfilePreferences,
    saveNotificationPreferences,
    uploadAvatar,
    removeAvatar,
    checkNicknameAvailability,
    goldDailyCollect,
    saveMapObjects,
  };
};

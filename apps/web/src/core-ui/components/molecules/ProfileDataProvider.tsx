'use client';

import { useIsAuthenticated, useProfileData } from '@/core-ui/hooks';
import { useLoading } from '@/core-ui/stores';
import { ReactNode } from 'react';
import { LoaderScreen } from './LoaderScreen';

/**
 * Profile-data gate. Once a wallet is connected the user's profile becomes a
 * hard blocker for the rest of the app (onboarding/tutorial flags, nickname,
 * crypto-savvy, …), so we fetch it eagerly and hold a full-screen loader until
 * it resolves.
 *
 * Mounted inside `ConfigProvider`, so `network` is already seeded by the time
 * this runs — `useProfileData` is `enabled` on `network.networkName &&
 * walletAddress`. The result lives in the React Query cache, so every
 * downstream `useProfileData()` consumer reads it for free with no refetch.
 */
export const ProfileDataProvider = ({ children }: { children: ReactNode }) => {
  const isAuthenticated = useIsAuthenticated();
  const { isLoading } = useProfileData();

  // Only block when there's a wallet to load a profile for. On public /
  // anonymous routes the query is disabled, so `isLoading` stays false and we
  // pass straight through.
  const blocking = isAuthenticated && isLoading;

  useLoading('profile', blocking);

  if (blocking) {
    return <LoaderScreen withImage />;
  }

  return children;
};
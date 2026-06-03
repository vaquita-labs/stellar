'use client';

import { useConfigStore } from '../stores';

export const useIsAuthenticated = () => {
  const walletAddress = useConfigStore((state) => state.walletAddress);
  return !!walletAddress;
};


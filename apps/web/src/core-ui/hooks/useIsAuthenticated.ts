'use client';

import { useNetworkConfigStore } from '../stores';

export const useIsAuthenticated = () => {
  const walletAddress = useNetworkConfigStore((state) => state.walletAddress);
  return !!walletAddress;
};


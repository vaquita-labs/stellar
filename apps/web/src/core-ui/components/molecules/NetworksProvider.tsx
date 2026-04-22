'use client';

import { useLoading, useNetworkConfigStore } from '@/core-ui/stores';
import { ReactNode, useEffect } from 'react';
import { useNetworks } from '../../hooks';

export const NetworksProvider = ({ children }: { children: ReactNode }) => {
  const {
    data: { networks, types },
    isLoading,
  } = useNetworks();
  const { setNetwork, setTypes, network, lockPeriod, setLockPeriod, token } =
    useNetworkConfigStore();

  useEffect(() => {
    if (!isLoading) {
      setTypes(types);
    }
  }, [setTypes, types, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      if (token?.lockPeriod?.[0] && !token.lockPeriod.includes(lockPeriod)) {
        setLockPeriod(token.lockPeriod[0]);
      }
    }
  }, [isLoading, lockPeriod, setLockPeriod, token?.lockPeriod]);

  useEffect(() => {
    if (!isLoading) {
      console.info('NetworksProvider useEffect', { network, networks });
      const networkDefault = networks[0] ?? null;
      if (!!network) {
        const networkFound = networks.find((n) => n.name === network.name) || networkDefault;
        if (JSON.stringify(networkFound) !== JSON.stringify(network)) {
          // setNetwork(networkFound);
        }
      } else {
        setNetwork(networkDefault);
      }
    }
  }, [network, networks, setNetwork, isLoading]);

  useLoading('network', isLoading || !network);

  if (isLoading || !network) {
    return null;
  }

  return children;
};

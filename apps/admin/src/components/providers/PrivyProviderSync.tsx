'use client';

import { VAQUITA_KEY_TIMESTAMP, VAQUITA_TIMESTAMP_VALUE } from '@/components/providers/constants';
import { T } from '@/core-ui/components/atoms';
import { LoaderScreen } from '@/core-ui/components/molecules/LoaderScreen';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { usePrivyStore } from '@/stores';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import React, { useEffect, useRef, useState } from 'react';

function normalizeChainId(chainId: string | number | undefined): number | null {
  if (typeof chainId === 'number') return chainId;
  if (typeof chainId === 'string') {
    const cleaned = chainId.replace(/^eip155:/, '');
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function PrivyProviderSync() {
  const { ready, authenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  const { walletAddress: userWalletAddress, network, setWalletAddress, reset } = useNetworkConfigStore();
  const setPrivyData = usePrivyStore((s) => s.setPrivyData);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPrivyData({ ready, authenticated, wallets, logout });
  }, [ready, authenticated, wallets, setPrivyData, logout]);

  const walletAddress = user?.wallet?.address ?? '';
  useEffect(() => {
    if (ready) {
      setWalletAddress(walletAddress);
    }
  }, [setWalletAddress, walletAddress, ready]);

  const walletRef = useRef(wallets[0]);
  walletRef.current = wallets[0];
  const currentChainId = normalizeChainId(wallets[0]?.chainId);

  const resetHardRef = useRef(() => {});
  resetHardRef.current = () => {
    reset(true);
    void logout();
  };

  useEffect(() => {
    const handleFocus = () => {
      const timestamp = +(localStorage.getItem(VAQUITA_KEY_TIMESTAMP) ?? 0);
      console.info('focus window', timestamp, VAQUITA_TIMESTAMP_VALUE.current);
      if (!!timestamp && timestamp > VAQUITA_TIMESTAMP_VALUE.current) {
        console.info('hard reset');
        resetHardRef.current();
      }
      VAQUITA_TIMESTAMP_VALUE.current = Date.now();
      localStorage.setItem(VAQUITA_KEY_TIMESTAMP, VAQUITA_TIMESTAMP_VALUE.current.toString());
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('mouseenter', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('mouseenter', handleFocus);
    };
  }, []);
  const networkName = network?.name ?? '';
  useEffect(() => {
    const fun = async () => {
      try {
        if (!walletRef.current || !userWalletAddress) {
          return;
        }
        setLoading(true);

        setLoading(false);
      } catch (error) {
        console.error('User declined chain switch', error);
      }
    };
    void fun();
  }, [userWalletAddress, networkName, currentChainId, reset]);

  if (loading) {
    return (
      <LoaderScreen withImage>
        <T>Loading...</T>
      </LoaderScreen>
    );
  }

  return null;
}

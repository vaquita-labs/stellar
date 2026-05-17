'use client';

import { useNetworkConfigStore } from '@/core-ui/stores';
import { usePollar } from '@pollar/react';
import { useEffect } from 'react';
import { pollarAdapter, setPollarBinding } from './adapters/pollar-adapter';
import { usePollarReadyStore } from './pollarReady';
import { getActiveAdapter, setActiveAdapter } from './registry';

/**
 * Bridges Pollar's React context into the framework-agnostic wallet registry.
 *
 * Responsibilities:
 *  - When the user is authenticated with Pollar, bind the PollarClient + wallet address
 *    into the adapter and mark Pollar as the active adapter.
 *  - When the user logs out, clear the binding and (if Pollar was active) clear the adapter.
 *  - Mirror the wallet address into the existing Zustand store so the rest of the app keeps working.
 */
export function PollarBridge() {
  const { walletAddress, isAuthenticated, getClient, logout } = usePollar();
  const setWalletAddress = useNetworkConfigStore((s) => s.setWalletAddress);
  const setPollarReady = usePollarReadyStore((s) => s.setReady);

  // Flip the global `pollarReady` flag once Pollar has finished its initial
  // session restore. Providers.tsx blocks the auth-gate redirect on this so
  // F5 doesn't bounce the user to /login while Pollar is still loading.
  useEffect(() => {
    const client = getClient();
    let cancelled = false;
    void client.ready().then(() => {
      if (cancelled) return;
      setPollarReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [getClient, setPollarReady]);

  useEffect(() => {
    if (isAuthenticated && walletAddress) {
      setPollarBinding({
        client: getClient(),
        walletAddress,
        logout,
      });
      // Pollar is the source of truth while authenticated — always make it the active adapter
      // so signing routes through Pollar instead of any previously-active kit session.
      setActiveAdapter(pollarAdapter);
      setWalletAddress(walletAddress);
      return;
    }

    // Not authenticated: drop the binding. If Pollar was the active adapter, demote it.
    setPollarBinding(null);
    const active = getActiveAdapter();
    if (active?.id === 'pollar') {
      setActiveAdapter(null);
      setWalletAddress('');
    }
  }, [isAuthenticated, walletAddress, getClient, logout, setWalletAddress]);

  return null;
}

'use client';

import { useConfigStore } from '@/core-ui/stores';
import { usePollar } from '@pollar/react';
import { useEffect, useState } from 'react';
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
  const setWalletAddress = useConfigStore((s) => s.setWalletAddress);
  const setPollarReady = usePollarReadyStore((s) => s.setReady);

  // Track when Pollar's initial session restore (`client.ready()`) has resolved.
  // This alone is NOT enough to declare the auth-gate "settled": `ready()` can
  // resolve a tick before `usePollar()` re-renders with the restored
  // `walletAddress`, so we also wait for the mirror below before flipping
  // `pollarReady`. Otherwise F5 bounces a logged-in user to /login.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const client = getClient();
    let cancelled = false;
    void client.ready().then(() => {
      if (cancelled) return;
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [getClient]);

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
    } else {
      // Not authenticated: drop the binding. If Pollar was the active adapter, demote it.
      setPollarBinding(null);
      const active = getActiveAdapter();
      if (active?.id === 'pollar') {
        setActiveAdapter(null);
        setWalletAddress('');
      }
    }

    // Declare the gate "ready" only once restore has resolved AND the auth state
    // is consistent: either Pollar is genuinely logged out (redirect is correct),
    // or the restored address has been mirrored into the store (so the gate sees
    // `isAuthenticated` before it sees `pollarReady`). This closes the F5 flash.
    if (restored && (!isAuthenticated || walletAddress)) {
      setPollarReady(true);
    }
  }, [restored, isAuthenticated, walletAddress, getClient, logout, setWalletAddress, setPollarReady]);

  return null;
}

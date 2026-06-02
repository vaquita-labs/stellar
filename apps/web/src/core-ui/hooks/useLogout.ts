'use client';

import { usePollar } from '@pollar/react';
import { setActiveAdapter } from '@/networks/stellar/wallet/registry';
import { useConfigStore } from '../stores';

/**
 * Single source of truth for logging out.
 *
 * Pollar is the auth source of truth, so we just call its `logout()` (which
 * clears its own DPoP key + session). We then eagerly drop the active adapter
 * and wallet address so the auth-gate in `Providers.tsx` redirects to `/login`
 * immediately — `PollarBridge` also clears these when Pollar's `isAuthenticated`
 * flips, but doing it here avoids waiting a render for that to propagate.
 *
 * Must be called from within the `PollarProvider` tree.
 */
export const useLogout = () => {
  const { logout } = usePollar();
  const setWalletAddress = useConfigStore((s) => s.setWalletAddress);

  return async () => {
    await logout();
    setActiveAdapter(null);
    setWalletAddress('');
  };
};

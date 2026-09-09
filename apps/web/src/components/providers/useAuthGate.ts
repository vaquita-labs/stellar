'use client';

import { useIsAuthenticated } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { usePollarReadyStore } from '@/networks/stellar/wallet/pollarReady';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const STELLAR_ADDRESS_KEY = 'swk:address';
// `/share` hosts the public achievement landing pages — visitors arriving from
// a shared link must never hit the auth gate or see the app chrome (nav/sidebar).
const PUBLIC_ROUTES = ['/login', '/terms', '/privacy', '/risk', '/blocked', '/share'];

/**
 * Owns the auth-gate decision: hydrates the persisted wallet address, waits for
 * Pollar's session-restore (`pollarReady`) and redirects unauthenticated users
 * on protected routes to `/login`. Returns what the shell needs to render.
 *
 * On non-public routes the loader stays up until Pollar gives a definitive
 * answer, so an F5 doesn't bounce a still-restoring session to `/login`.
 */
export function useAuthGate() {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const setWalletAddress = useConfigStore((s) => s.setWalletAddress);

  const isPublicRoute = !!pathname && PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const [hydrated, setHydrated] = useState(false);
  const pollarReady = usePollarReadyStore((s) => s.ready);
  const showAuthGate = hydrated && pollarReady && !isPublicRoute && !isAuthenticated;
  const showLoader = !hydrated || (!pollarReady && !isPublicRoute) || showAuthGate;

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STELLAR_ADDRESS_KEY) : null;
      if (saved) setWalletAddress(saved);
    } catch (error) {
      console.warn('Could not pre-hydrate wallet address', error);
    } finally {
      setHydrated(true);
    }
  }, [setWalletAddress]);

  useEffect(() => {
    if (showAuthGate) {
      // The query string travels with the path. Private routes carry state
      // there — `?tx=` opens a transaction's detail, `?period=` picks the
      // portfolio's window — and `redirect` is the only record of where the
      // visitor was going, so a path without its query sends them to the plain
      // screen after signing in, silently dropping what the link was for.
      //
      // Read off `window.location` and not `useSearchParams()`: that hook opts
      // the whole tree into client-side bailout and every consumer of this gate
      // would need a Suspense boundary around it. This runs in an effect, so
      // there is always a window, and the value is the one the browser has.
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const target =
        pathname && pathname !== '/login' ? `/login?redirect=${encodeURIComponent(`${pathname}${search}`)}` : '/login';
      router.replace(target);
    }
  }, [showAuthGate, router, pathname]);

  return { isPublicRoute, showLoader };
}

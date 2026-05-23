'use client';

import { DesktopSidebar, MobileNavigation } from '@/components';
import { AblyProvider, LoaderScreen, NetworksProvider, sendLogToAbly } from '@/core-ui/components';
import { getNetworks, useIsAuthenticated } from '@/core-ui/hooks';
import { useMapStore, useNetworkConfigStore, useResize } from '@/core-ui/stores';
import { useVisibility } from '@/core-ui/stores/visibility';
import { stellarWalletsKitResolver } from '@/networks/stellar/kit';
import { PollarBridge } from '@/networks/stellar/wallet/PollarBridge';
import { usePollarReadyStore } from '@/networks/stellar/wallet/pollarReady';
import { Toast } from '@heroui/react';
import { PollarProvider } from '@pollar/react';
import '@pollar/react/styles.css';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import * as Ably from 'ably';
import { ChannelProvider, useChannel } from 'ably/react';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { TransactionsProvider } from './TransactionsProvider';
import { WalletProviderSync } from './WalletProviderSync';

const POLLAR_API_KEY = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY ?? '';
const POLLAR_NETWORK =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet').toLowerCase() === 'public' ? 'mainnet' : 'testnet';

export const queryClient = new QueryClient();

const originalLog = console.log;
const originalInfo = console.info;
const originalError = console.error;
const originalWarn = console.warn;

if (process.env.NODE_ENV !== 'development') {
  console.log = (...args) => {
    void sendLogToAbly('log', args);
    originalLog(...args);
  };
  console.info = (...args) => {
    void sendLogToAbly('info', args);
    originalInfo(...args);
  };
  console.error = (...args) => {
    void sendLogToAbly('error', args);
    originalError(...args);
  };
  console.warn = (...args) => {
    void sendLogToAbly('warn', args);
    originalWarn(...args);
  };
}

const STELLAR_ADDRESS_KEY = 'swk:address';

export function Providers({ children }: { children: ReactNode }) {
  const { ref } = useResize();
  useVisibility();
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const setWalletAddress = useNetworkConfigStore((s) => s.setWalletAddress);
  const PUBLIC_ROUTES = ['/login', '/terms', '/privacy'];
  const isPublicRoute = !!pathname && PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // Show the bottom navbar on `/profile` itself, but hide it on any deeper
  // profile sub-route (settings, edit, wallet, friends, notifications, …).
  const isProfileSubRoute = pathname?.startsWith('/profile/') ?? false;
  const isShopRoute = pathname?.startsWith('/shop') ?? false;
  const isEditingMap = useMapStore((s) => s.isEditingMap);
  const hideNavigation = isShopRoute || isEditingMap;

  const [hydrated, setHydrated] = useState(false);
  // True once PollarClient.ready() has resolved (DPoP key restored + session
  // restore decision made). Flipped by PollarBridge. Gating the auth-gate on
  // this prevents F5 from bouncing Pollar-authenticated users to /login while
  // the session is still being restored in the background.
  const pollarReady = usePollarReadyStore((s) => s.ready);
  const showAuthGate = hydrated && pollarReady && !isPublicRoute && !isAuthenticated;
  // On non-public routes, keep the loader visible until we have a definitive
  // answer from Pollar (`pollarReady`). Public routes (login/terms/privacy)
  // shouldn't be blocked — they need to render even when there is no session.
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
    const listener = () => {
      const vh = window.innerHeight * 0.01;
      document?.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    listener();
    window?.addEventListener('resize', listener);
    return () => window?.removeEventListener('resize', listener);
  }, []);

  useEffect(() => {
    if (showAuthGate) {
      router.replace('/login');
    }
  }, [showAuthGate, router]);

  return (
    <PollarProvider
      config={{
        baseUrl: 'https://sdk.api.pollar.xyz',
        apiKey: POLLAR_API_KEY,
        stellarNetwork: POLLAR_NETWORK,
        walletAdapter: stellarWalletsKitResolver,
      }}
    >
      <PollarBridge />
      <AblyProvider>
        <Toast.Provider placement="top" />
        <ChannelProvider channelName="deposits-changes">
          {showLoader ? (
            <LoaderScreen withImage />
          ) : (
            <div className="flex bg-background" style={{ overflow: 'hidden' }} ref={ref}>
              {!isPublicRoute && !hideNavigation && <DesktopSidebar />}
              <Main withSidebar={!isPublicRoute && !hideNavigation}>{children}</Main>
              {!isPublicRoute && !isProfileSubRoute && !hideNavigation && <MobileNavigation />}
            </div>
          )}
        </ChannelProvider>
        <TransactionsProvider />
      </AblyProvider>
    </PollarProvider>
  );
}

const ListenDepositsChanges = () => {
  const queryClient = useQueryClient();
  const handleChange = (message: Ably.Message) => {
    console.info('handleChange', message);
    return queryClient.invalidateQueries({ queryKey: ['deposit'], exact: false });
  };
  useChannel('deposits-changes', 'change', handleChange);
  return null;
};

const Main = ({ children, withSidebar }: { children: ReactNode; withSidebar: boolean }) => {
  const [types, setTypes] = useState<string[]>([]);
  useEffect(() => {
    const fun = async () => {
      const { types } = await getNetworks();
      setTypes(types);
    };
    void fun();
  }, []);
  if (types.length === 0) return null;

  return (
    <main
      className={`flex-1 flex flex-col${withSidebar ? ' md:ml-64' : ''}`}
      style={{ height: 'var(--100VH)', minHeight: 'var(--100VH)', maxHeight: 'var(--100VH)', overflow: 'hidden' }}
      key={types.join(',')}
    >
      <QueryClientProvider client={queryClient}>
        <WalletProviderSync />
        <NetworksProvider>{children}</NetworksProvider>
        <ListenDepositsChanges />
      </QueryClientProvider>
    </main>
  );
};

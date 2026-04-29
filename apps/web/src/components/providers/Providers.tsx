'use client';

import { DesktopSidebar, MobileNavigation } from '@/components';
import { AblyProvider, LoaderScreen, NetworksProvider, sendLogToAbly } from '@/core-ui/components';
import { getNetworks, useIsAuthenticated } from '@/core-ui/hooks';
import { useMapStore, useNetworkConfigStore, useResize } from '@/core-ui/stores';
import { useVisibility } from '@/core-ui/stores/visibility';
import { Toast } from '@heroui/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import * as Ably from 'ably';
import { ChannelProvider, useChannel } from 'ably/react';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { TransactionsProvider } from './TransactionsProvider';
import { WalletProviderSync } from './WalletProviderSync';

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
  const isPublicRoute = pathname === '/login';
  const isProfileRoute = pathname?.startsWith('/profile') ?? false;
  const isShopRoute = pathname?.startsWith('/shop') ?? false;
  const isEditingMap = useMapStore((s) => s.isEditingMap);
  const hideNavigation = isShopRoute || isEditingMap;

  const [hydrated, setHydrated] = useState(false);
  const showAuthGate = hydrated && !isPublicRoute && !isAuthenticated;
  const showLoader = !hydrated || showAuthGate;

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
    <AblyProvider>
      <Toast.Provider placement="top" />
      <ChannelProvider channelName="deposits-changes">
        {showLoader ? (
          <LoaderScreen withImage />
        ) : (
          <div className="flex bg-background" style={{ overflow: 'hidden' }} ref={ref}>
            {!isPublicRoute && !hideNavigation && <DesktopSidebar />}
            <Main withSidebar={!isPublicRoute && !hideNavigation}>{children}</Main>
            {!isPublicRoute && !isProfileRoute && !hideNavigation && <MobileNavigation />}
          </div>
        )}
      </ChannelProvider>
      <TransactionsProvider />
    </AblyProvider>
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

'use client';

import { DesktopSidebar, MobileNavigation } from '@/components';
import { AblyProvider, NetworksProvider, sendLogToAbly } from '@/core-ui/components';
import { getNetworks } from '@/core-ui/hooks';
import { useResize } from '@/core-ui/stores';
import { useVisibility } from '@/core-ui/stores/visibility';
import { Toast } from '@heroui/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import * as Ably from 'ably';
import { ChannelProvider, useChannel } from 'ably/react';
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

export function Providers({ children }: { children: ReactNode }) {
  const { ref } = useResize();
  useVisibility();

  useEffect(() => {
    const listener = () => {
      const vh = window.innerHeight * 0.01;
      document?.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    listener();
    window?.addEventListener('resize', listener);
    return () => window?.removeEventListener('resize', listener);
  }, []);

  return (
    <AblyProvider>
      <Toast.Provider />
      {/*<ToastProvider placement="top-center" />*/}
      <ChannelProvider channelName="deposits-changes">
        <div className="flex bg-background" style={{ overflow: 'hidden' }} ref={ref}>
          <DesktopSidebar />
          <Main>{children}</Main>
          <MobileNavigation />
        </div>
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

const Main = ({ children }: { children: ReactNode }) => {
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
      className="flex-1 md:ml-64 flex flex-col"
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

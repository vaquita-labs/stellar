'use client';

import { AblyProvider, NetworksProvider } from '@/core-ui/components';
import { isEvmType } from '@/core-ui/helpers';
import { useNetworks } from '@/core-ui/hooks';
import { useResizeStore } from '@/core-ui/stores';
import { initPosthog } from '@/posthog';
import { HeroUIProvider, ToastProvider } from '@heroui/react';
import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect } from 'react';
import { useResizeDetector } from 'react-resize-detector';
import { base, baseSepolia, coreTestnet2, lisk, scrollSepolia } from 'viem/chains';
import { PrivyProviderSync } from './PrivyProviderSync';
import { TransactionsProvider } from './TransactionsProvider';

export const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  const { width = 0, height = 0, ref } = useResizeDetector();
  const setResize = useResizeStore((store) => store.setResize);
  useEffect(() => {
    setResize(width, height);
  }, [width, height, setResize]);

  useEffect(() => {
    initPosthog();
    const listener = () => {
      const vh = window.innerHeight * 0.01;
      document?.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    listener();
    window?.addEventListener('resize', listener);
    return () => {
      window?.removeEventListener('resize', listener);
    };
  }, []);

  return (
    <AblyProvider>
      <HeroUIProvider>
        <ToastProvider placement="top-center" />
        <QueryClientProvider client={queryClient}>
          <NetworksProvider>
            <div className="flex bg-background" style={{ overflow: 'hidden' }} ref={ref}>
              <Main>{children}</Main>
            </div>
          </NetworksProvider>
          <TransactionsProvider />
        </QueryClientProvider>
      </HeroUIProvider>
    </AblyProvider>
  );
}

const Main = ({ children }: { children: ReactNode }) => {
  const { data: { types } = { types: [] } } = useNetworks();
  const isEVM = isEvmType(types);
  return (
    <main
      className="flex-1 flex flex-col"
      style={{ height: 'var(--100VH)', minHeight: 'var(--100VH)', maxHeight: 'var(--100VH)', overflow: 'hidden' }}
      key={types.join(',')}
    >
      {isEVM.is ? (
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
          config={{
            loginMethods: ['email', 'wallet'],
            // defaultChain:,
            embeddedWallets: {
              ethereum: {
                createOnLogin: 'users-without-wallets',
              },
            },
            supportedChains: [lisk, baseSepolia, scrollSepolia, coreTestnet2, base],
          }}
        >
          <PrivyProviderSync />
          {children}
        </PrivyProvider>
      ) : (
        children
      )}
    </main>
  );
};

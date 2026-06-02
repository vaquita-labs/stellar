'use client';

import { AblyProvider } from '@/core-ui/components';
import { useResizeStore } from '@/core-ui/stores';
import { Toast } from '@heroui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect } from 'react';
import { useResizeDetector } from 'react-resize-detector';
import { TransactionsProvider } from './TransactionsProvider';

export const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  const { width = 0, height = 0, ref } = useResizeDetector();
  const setResize = useResizeStore((store) => store.setResize);
  useEffect(() => {
    setResize(width, height);
  }, [width, height, setResize]);

  useEffect(() => {
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
      <Toast.Provider placement="top" />
      <QueryClientProvider client={queryClient}>
        {/* TODO(single-network): NetworksProvider (which fetched /api/v1/network and
            gated render) was removed. Restore a project-config bootstrap here if the
            admin ever needs server-driven network config again. */}
        <div className="flex bg-background" style={{ overflow: 'hidden' }} ref={ref}>
          <Main>{children}</Main>
        </div>
        <TransactionsProvider />
      </QueryClientProvider>
    </AblyProvider>
  );
}

const Main = ({ children }: { children: ReactNode }) => {
  return (
    <main
      className="flex-1 flex flex-col"
      style={{ height: 'var(--100VH)', minHeight: 'var(--100VH)', maxHeight: 'var(--100VH)', overflow: 'hidden' }}
    >
      {children}
    </main>
  );
};

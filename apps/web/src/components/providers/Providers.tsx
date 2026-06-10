'use client';

import { AblyProvider } from '@/core-ui/components';
import { I18nProvider } from '@/core-ui/i18n/I18nProvider';
import { useVisibility } from '@/core-ui/stores/visibility';
import { getNetworkEnum } from '@/networks/stellar/kit';
import { PollarBridge } from '@/networks/stellar/wallet/PollarBridge';
import { Toast } from '@heroui/react';
import { PollarProvider } from '@pollar/react';
import '@pollar/react/styles.css';
import { createStellarWalletsKitBundle } from '@pollar/stellar-wallets-kit-adapter/picker';
import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ChannelProvider } from 'ably/react';
import { ReactNode, useState } from 'react';
import { AppShell } from './AppShell';
import { useAuthGate } from './useAuthGate';
import { useConsoleToAbly } from './useConsoleToAbly';
import { useViewportVh } from './useViewportVh';

const POLLAR_API_KEY = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY ?? '';
const POLLAR_NETWORK =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet').toLowerCase() === 'public' ? 'mainnet' : 'testnet';

const bundle = createStellarWalletsKitBundle({
  network: getNetworkEnum(),
  // picker: { wallets: ['xbull', 'lobstr', 'freighter'] },
});

export function Providers({ children }: { children: ReactNode }) {
  useVisibility();
  useViewportVh();
  useConsoleToAbly();
  const { isPublicRoute, showLoader } = useAuthGate();

  // Single QueryClient per app session — created lazily so it isn't shared
  // across requests/StrictMode remounts, and lifted to the top so react-query
  // is available everywhere below.
  //
  // Data is treated as fresh until explicitly invalidated (e.g. the Ably
  // `deposits-changes` channel after a deposit/withdraw, or the profile
  // invalidation after the daily check-in). This avoids spinners on reload /
  // tab focus — values render instantly from the persisted cache and only
  // refetch when something actually changed.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Infinity,
            gcTime: 1000 * 60 * 60 * 24, // 24h — keep entries around for persistence
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
          },
        },
      })
  );

  // Persist the cache to localStorage so reloads show the last known values
  // immediately instead of flashing a spinner. SSR-safe: falls back to a noop
  // store when `window` is unavailable.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      key: 'vaquita-rq-cache',
      storage:
        typeof window !== 'undefined'
          ? window.localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    })
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
    >
      <I18nProvider>
      <PollarProvider
        client={{
          baseUrl: 'https://sdk.api.pollar.xyz',
          apiKey: POLLAR_API_KEY,
          walletAdapter: bundle.walletAdapter,
          stellarNetwork: POLLAR_NETWORK,
        }}
        ui={{ renderWallets: bundle.renderWallets }}
      >
        <PollarBridge />
        <AblyProvider>
          <Toast.Provider placement="top" />
          <ChannelProvider channelName="deposits-changes">
            <ChannelProvider channelName="notifications-changes">
              <AppShell isPublicRoute={isPublicRoute} showLoader={showLoader}>
                {children}
              </AppShell>
            </ChannelProvider>
          </ChannelProvider>
        </AblyProvider>
      </PollarProvider>
      </I18nProvider>
    </PersistQueryClientProvider>
  );
}

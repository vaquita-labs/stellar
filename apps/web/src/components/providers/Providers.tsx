'use client';

import { AblyProvider } from '@/core-ui/components';
import { clientEnv } from '@/core-ui/config/clientEnv';
// Side-effect import: registers the `beforeinstallprompt` listener at bundle
// evaluation, before the browser fires the (single) install event.
import '@/core-ui/hooks/useInstallApp';
import { I18nProvider } from '@/core-ui/i18n/I18nProvider';
import { useVisibility } from '@/core-ui/stores/visibility';
import { getNetworkEnum, getStellarNetwork } from '@/networks/stellar/kit';
import { PollarBridge } from '@/networks/stellar/wallet/PollarBridge';
import { Toast } from '@heroui/react';
import { PollarProvider } from '@pollar/react';
import '@pollar/react/styles.css';
import { stellarWalletsKitAdapters } from '@pollar/stellar-wallets-kit-adapter';
import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ChannelProvider } from 'ably/react';
import { ReactNode, useState } from 'react';
import { AppShell } from './AppShell';
import { GameClockSync } from './GameClockSync';
import { useAuthGate } from './useAuthGate';
import { useConsoleToAbly } from './useConsoleToAbly';
import { useViewportVh } from './useViewportVh';

const POLLAR_API_KEY = clientEnv.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY;
const POLLAR_NETWORK = getStellarNetwork();

// One `WalletAdapter` per kit module (xBull, Lobstr, Freighter, …), registered
// on the client so Pollar's own login modal renders them as wallet buttons.
// Returns `[]` during SSR — the adapters are browser-only.
const walletAdapters = stellarWalletsKitAdapters({
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
            staleTime: 1000 * 60 * 60 * 24,
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
  // store when `window` is unavailable. `buster` below decides how long those
  // values survive a deploy.
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
      // A cache entry is only restored when its buster matches; otherwise the
      // whole persisted client is dropped and every query refetches. Bump
      // NEXT_PUBLIC_QUERY_CACHE_VERSION whenever a release reads a field that
      // older cached payloads do not carry — without it those clients keep
      // serving the old shape for up to `maxAge`, with no request to notice.
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24,
        buster: clientEnv.NEXT_PUBLIC_QUERY_CACHE_VERSION,
      }}
    >
      <I18nProvider>
      <PollarProvider
        client={{
          baseUrl: 'https://sdk.api.pollar.xyz',
          apiKey: POLLAR_API_KEY,
          walletAdapters,
          stellarNetwork: POLLAR_NETWORK,
        }}
      >
        <PollarBridge />
        <GameClockSync />
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

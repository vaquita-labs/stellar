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
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { PersistQueryClientProvider, removeOldestQuery } from '@tanstack/react-query-persist-client';
import { ChannelProvider } from 'ably/react';
import { ReactNode, useState } from 'react';
import { AppShell } from './AppShell';
import { GameClockSync } from './GameClockSync';
import { PostHogProvider } from './PostHogProvider';
import { useAuthGate } from './useAuthGate';
import { useWalletBalanceRefreshOnMount } from '@/core-ui/hooks/useWalletBalanceRefresh';
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
  // Refresca el snapshot on-chain de la wallet al abrir la app. El server tiene
  // su propio TTL, así que recargar seguido no dispara lecturas RPC de más.
  useWalletBalanceRefreshOnMount();
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
      // Without a `retry` the persister is silently all-or-nothing: its
      // `setItem` is wrapped in a bare try/catch that returns the error, and
      // with nothing to retry the write is simply abandoned — nothing stored,
      // nothing logged. One over-quota snapshot (the 5 MB localStorage ceiling)
      // then freezes the persisted cache forever, and every reload restores the
      // state from before the overflow. Shedding the oldest entries keeps the
      // rest of the snapshot writable, and the warning says it is happening.
      retry: (props) => {
        if (props.errorCount === 1) {
          console.warn('[query-cache] could not persist, dropping the oldest entries', props.error);
        }
        return removeOldestQuery(props);
      },
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
        dehydrateOptions: {
          // The on-chain vault position keeps its share balance as a `bigint`,
          // which `JSON.stringify` refuses to serialize. Persisting it threw on
          // every write, and the persister swallows that error the same way it
          // swallows a full disk, so the whole snapshot stopped being updated.
          // It is a live money read that revalidates on mount anyway, so it has
          // nothing to gain from a day-old copy — leave it out of the snapshot.
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) && query.queryKey[0] !== 'defindex-vault-position',
        },
      }}
    >
      <I18nProvider>
      <PostHogProvider>
      <PollarProvider
        client={{
          baseUrl: 'https://sdk.api.pollar.xyz',
          apiKey: POLLAR_API_KEY,
          walletAdapters,
          stellarNetwork: POLLAR_NETWORK,
          // El SDK aborta cada request a los 10s por defecto, y crear un ramp
          // tarda más que eso: el proveedor cotiza, emite el QR y —con wallet
          // custodial— Pollar arma, firma y ENVÍA el pago on-chain dentro del
          // mismo POST. Cortarlo a los 10s deja la operación viva del lado del
          // servidor y al usuario con un "Request timed out" y sin QR. Un minuto
          // es el techo con sentido: es lo que vive la cotización del proveedor.
          requestTimeoutMs: 60_000,
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
      </PostHogProvider>
      </I18nProvider>
    </PersistQueryClientProvider>
  );
}

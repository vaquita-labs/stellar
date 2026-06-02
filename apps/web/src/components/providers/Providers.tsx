'use client';

import { AblyProvider } from '@/core-ui/components';
import { useVisibility } from '@/core-ui/stores/visibility';
import { getNetworkEnum } from '@/networks/stellar/kit';
import { PollarBridge } from '@/networks/stellar/wallet/PollarBridge';
import { Toast } from '@heroui/react';
import { PollarProvider } from '@pollar/react';
import '@pollar/react/styles.css';
import { createStellarWalletsKitBundle } from '@pollar/stellar-wallets-kit-adapter/picker';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
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
            <AppShell isPublicRoute={isPublicRoute} showLoader={showLoader}>
              {children}
            </AppShell>
          </ChannelProvider>
        </AblyProvider>
      </PollarProvider>
    </QueryClientProvider>
  );
}

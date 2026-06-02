'use client';

import { VAQUITA_KEY_TIMESTAMP, VAQUITA_TIMESTAMP_VALUE } from '@/components/providers/constants';
import { LoaderScreen } from '@/core-ui/components/molecules/LoaderScreen';
import { useConfigStore } from '@/core-ui/stores';
import { isStellarNetwork } from '@/networks/stellar';
import { stellarSession } from '@/networks/stellar/stellar';
import { useEffect, useRef, useState } from 'react';

/**
 * Bootstraps the Stellar wallet session. This is a single-network app: the
 * project config is always a Stellar network, so the provider only ever *enters*
 * a Stellar session — there is no other network to transition out of, hence no
 * disconnect/teardown branch (`isStellar` is a derived value, not state).
 */
export function WalletProviderSync() {
  const network = useConfigStore((s) => s.network);
  const isStellar = !!network && isStellarNetwork(network.networkName);

  const [stellarReady, setStellarReady] = useState(false);
  const sessionRef = useRef<ReturnType<typeof stellarSession> | null>(null);

  useEffect(() => {
    // `network === null` means ConfigProvider hasn't loaded the network yet —
    // don't touch any adapter; just keep this provider non-blocking. The
    // auth-gate in Providers.tsx decides what to render.
    if (!network) {
      setStellarReady(true);
      return;
    }

    if (isStellar && !sessionRef.current) {
      sessionRef.current = stellarSession();
      // Hydrate (restore) the saved wallet.
      sessionRef.current.hidrate().finally(() => setStellarReady(true));
      return;
    }

    setStellarReady(true);
  }, [network, isStellar]);

  // Track focus / return-to-tab timestamps used elsewhere for staleness checks.
  useEffect(() => {
    const handleFocus = () => {
      VAQUITA_TIMESTAMP_VALUE.current = Date.now();
      localStorage.setItem(VAQUITA_KEY_TIMESTAMP, VAQUITA_TIMESTAMP_VALUE.current.toString());
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('mouseenter', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('mouseenter', handleFocus);
    };
  }, []);

  if (!stellarReady) {
    return (
      <LoaderScreen withImage>
        <></>
      </LoaderScreen>
    );
  }

  return null;
}

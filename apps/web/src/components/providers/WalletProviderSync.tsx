'use client';

import { VAQUITA_KEY_TIMESTAMP, VAQUITA_TIMESTAMP_VALUE } from '@/components/providers/constants';
import { LoaderScreen } from '@/core-ui/components/molecules/LoaderScreen';
import { useConfigStore } from '@/core-ui/stores';
import { isStellarNetwork } from '@/networks/stellar';
import { stellarSession } from '@/networks/stellar/stellar';
import { getActiveAdapter } from '@/networks/stellar/wallet/registry';
import React, { useEffect, useRef, useState } from 'react';

/**
 * Componente de sincronización de carteras Stellar
 * Integra Stellar Wallet Kit para gestión de carteras Stellar
 */
export function WalletProviderSync() {
  const { walletAddress: userWalletAddress, network, reset } = useConfigStore();

  // Estado para Stellar Wallet Kit
  const [stellarReady, setStellarReady] = useState(false);
  const [isStellar, setIsStellar] = useState(false);
  const sessionRef = useRef<ReturnType<typeof stellarSession> | null>(null);

  // Determinar si la red actual es Stellar
  useEffect(() => {
    const isStellarNet = network ? isStellarNetwork(network.networkName) : false;
    setIsStellar(isStellarNet);
  }, [network]);

  // Track the previous isStellar value so we can distinguish "first sample
  // before network has loaded" from "we were on Stellar and are now leaving".
  // Without this, the initial mount fires the cleanup branch with `network`
  // still null, which tears down a freshly restored Pollar session.
  const wasStellarRef = useRef<boolean | null>(null);

  // Inicializar sesión de Stellar cuando la red es Stellar
  useEffect(() => {
    // Wait for ConfigProvider to load the network before deciding to
    // touch any adapter — `network = null` is "unknown", not "non-Stellar".
    // We still mark this provider as "ready" so its internal loader doesn't
    // block; the auth-gate in Providers.tsx is what decides what to render.
    if (!network) {
      setStellarReady(true);
      return;
    }

    const wasStellar = wasStellarRef.current;
    wasStellarRef.current = isStellar;

    if (isStellar && !sessionRef.current) {
      sessionRef.current = stellarSession();
      // Hidratar (restaurar) la cartera guardada
      sessionRef.current.hidrate().finally(() => {
        setStellarReady(true);
      });
      return;
    }

    if (!isStellar) {
      // Only run the disconnect when we are actually transitioning OUT of a
      // Stellar network. The initial sample (wasStellar === null) means we
      // just mounted on a non-Stellar route — there's nothing to clean up.
      if (wasStellar === true) {
        const active = getActiveAdapter();
        if (active) {
          void active.disconnect();
        }
        if (sessionRef.current) {
          void sessionRef.current.logout();
          sessionRef.current = null;
        }
      }
      setStellarReady(true); // No es Stellar, considerar listo
    }
  }, [isStellar, network]);

  // Hard reset por foco
  const resetHardRef = useRef(() => {});
  resetHardRef.current = () => {
    reset(true);
    if (sessionRef.current) {
      void sessionRef.current.logout();
    }
  };

  useEffect(() => {
    const handleFocus = () => {
      const timestamp = +(localStorage.getItem(VAQUITA_KEY_TIMESTAMP) ?? 0);
      if (!!timestamp && timestamp > VAQUITA_TIMESTAMP_VALUE.current) {
        // Si quieres forzar hard reset al volver de otra pestaña, descomenta:
        // resetHardRef.current();
      }
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

  // Placeholder de lógica adicional cuando tengas address+network
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const run = async () => {
      try {
        if (!userWalletAddress) return;
        setLoading(true);
        // ... tu lógica de post-conexión ...
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [userWalletAddress, network?.networkName, reset]);

  if (!stellarReady || loading) {
    return (
      <LoaderScreen withImage>
        <></>
      </LoaderScreen>
    );
  }

  return null;
}

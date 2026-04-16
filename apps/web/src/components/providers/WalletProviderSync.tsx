'use client';

import { VAQUITA_KEY_TIMESTAMP, VAQUITA_TIMESTAMP_VALUE } from '@/components/providers/constants';
import { LoaderScreen } from '@/core-ui/components/molecules/LoaderScreen';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { isStellarNetwork } from '@/networks/stellar';
import { stellarSession } from '@/networks/stellar/stellar';
import { usePrivyStore } from '@/stores';
import React, { useEffect, useRef, useState } from 'react';

/**
 * Componente de sincronización de carteras Stellar
 * Integra Stellar Wallet Kit para gestión de carteras Stellar
 */
export function WalletProviderSync() {
  const { walletAddress: userWalletAddress, network, reset } = useNetworkConfigStore();
  const setPrivyData = usePrivyStore((s) => s.setPrivyData);

  // Estado para Stellar Wallet Kit
  const [stellarReady, setStellarReady] = useState(false);
  const [isStellar, setIsStellar] = useState(false);
  const sessionRef = useRef<ReturnType<typeof stellarSession> | null>(null);

  // Determinar si la red actual es Stellar
  useEffect(() => {
    const isStellarNet = network ? isStellarNetwork(network.name) : false;
    setIsStellar(isStellarNet);
  }, [network]);

  // Inicializar sesión de Stellar cuando la red es Stellar
  useEffect(() => {
    if (isStellar && !sessionRef.current) {
      sessionRef.current = stellarSession();
      // Hidratar (restaurar) la cartera guardada
      sessionRef.current.hidrate().finally(() => {
        setStellarReady(true);
      });
    } else if (!isStellar) {
      // Si cambiamos de Stellar a otra red, desconectar la cartera Stellar
      if (sessionRef.current) {
        void sessionRef.current.logout();
        sessionRef.current = null;
      }
      setStellarReady(true); // No es Stellar, considerar listo
    }
  }, [isStellar]);

  // Sincronizar address desde Stellar Wallet Kit
  useEffect(() => {
    if (!isStellar) return;

    // La dirección de Stellar ya está sincronizada por stellarSession
    // Solo actualizamos el store de compatibilidad
    const stellarAddress = userWalletAddress || '';

    setPrivyData({
      ready: stellarReady,
      authenticated: !!stellarAddress,
      logout: async () => {
        if (sessionRef.current) {
          await sessionRef.current.logout();
        }
      },
      userInfo: null,
      address: stellarAddress,
    });
  }, [isStellar, userWalletAddress, stellarReady, setPrivyData]);

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
  }, [userWalletAddress, network?.name, reset]);

  if (!stellarReady || loading) {
    return (
      <LoaderScreen withImage>
        <></>
      </LoaderScreen>
    );
  }

  return null;
}

'use client';

import { useEffect } from 'react';
import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch, hasWalletSession } from '@/networks/stellar/walletSession';

/**
 * Refresco del snapshot on-chain de la wallet (`POST /wallets/balances/refresh`).
 *
 * El saldo del vault ya no se barre por cron: se lee cuando *esa* wallet
 * interactúa con la app. El backend dispara solo los eventos que ya pasan por
 * el servidor (depósito, retiro, on/off-ramp); desde acá se cubren los dos que
 * no existen del lado del servidor: invertir en rendimiento pasivo — que se
 * firma entero en el browser — y abrir la app.
 *
 * La wallet la saca el server de la sesión, nunca del body: este fetch no elige
 * a quién leer.
 */
const REFRESH_URL = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/wallets/balances/refresh`;

/**
 * Pide un refresco. `force` para cuando ya sabemos que el saldo cambió; sin él
 * el server ignora el pedido si el snapshot es reciente.
 *
 * Nunca tira: es contabilidad de fondo, y un fallo acá no puede romper el flujo
 * que la llamó.
 */
export async function requestWalletBalanceRefresh(
  walletAddress: string | null | undefined,
  options: { force?: boolean } = {},
): Promise<void> {
  if (!walletAddress) return;
  // Sin token cacheado `authFetch` haría login, y eso abre el prompt de firma
  // de la wallet. Un refresco de saldo no vale una firma.
  if (!hasWalletSession(walletAddress)) return;

  try {
    await authFetch(
      REFRESH_URL(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: options.force === true }),
      },
      walletAddress,
    );
  } catch (error) {
    console.warn('[wallet-balances] refresh failed', error);
  }
}

/**
 * Dispara un refresco al conectar la wallet / abrir la app.
 *
 * Sin `force`: el server tiene su propio TTL, así que recargar la app diez
 * veces seguidas cuesta una sola lectura RPC.
 */
export function useWalletBalanceRefreshOnMount(): void {
  const { walletAddress } = useConfigStore();

  useEffect(() => {
    if (!walletAddress) return;
    void requestWalletBalanceRefresh(walletAddress);
  }, [walletAddress]);
}

'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { authFetch } from '@/networks/stellar/walletSession';

/**
 * Memoria de la compra en curso, del lado del servidor.
 *
 * Existe porque la API de ramps no tiene endpoint de listado: el id de
 * transacción que devuelve la creación es el único handle sobre una compra. Si
 * se pierde —otro dispositivo, storage limpiado— el usuario ya pagó y no hay
 * forma de volver a su pantalla. La wallet sale de la sesión, así que estas
 * llamadas no mandan dirección.
 */

const base = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/onramp`;

export interface PendingPurchase {
  id: string;
  providerTxId: string;
  provider: string;
  country: string;
  amountFiat: string;
  currency: string;
  status: string;
  /** ISO, o cadena vacía si el proveedor no publicó vencimiento. */
  expiresAt: string;
  createdAt: string;
}

export interface RecordPurchaseInput {
  providerTxId: string;
  provider: string;
  country: string;
  amountFiat: string;
  currency: string;
  expiresAt?: string | null;
}

/**
 * Deja registrada una compra recién creada. Devuelve el id local, o null si no
 * se pudo guardar.
 *
 * Quien la llama decide qué hacer con el fallo; lo que NO puede pasar es que un
 * error de registro tire abajo un pago que el proveedor ya aceptó.
 */
export async function recordPurchase(walletAddress: string, input: RecordPurchaseInput): Promise<string | null> {
  const response = await authFetch(
    `${base()}/purchases`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
    walletAddress,
  );
  const data = (await response.json().catch(() => null)) as { data?: { id?: string } } | null;
  return data?.data?.id ?? null;
}

/** La compra que la wallet dejó a medias, o null si no hay ninguna. */
export async function fetchPendingPurchase(
  walletAddress: string,
): Promise<{ state: 'pending' | 'expired'; purchase: PendingPurchase } | null> {
  const response = await authFetch(`${base()}/purchases/pending`, { method: 'GET' }, walletAddress);
  const data = (await response.json().catch(() => null)) as {
    data?: { state?: string; purchase?: PendingPurchase };
  } | null;
  const state = data?.data?.state;
  if ((state !== 'pending' && state !== 'expired') || !data?.data?.purchase) return null;
  return { state, purchase: data.data.purchase };
}

/** Cómo terminó una compra, tal como lo guarda el servidor. */
export type TerminalPurchaseStatus = 'settled' | 'expired' | 'failed';

/**
 * Cierra la compra del lado del servidor para que deje de ofrecerse al volver.
 *
 * Devuelve si el servidor la dio por cerrada. No cerrarla no rompe nada
 * inmediato —la compra simplemente sigue apareciendo como pendiente— así que
 * quien llama no tiene por qué frenar el flujo por esto.
 */
export async function markPurchaseTerminal(
  walletAddress: string,
  id: string,
  status: TerminalPurchaseStatus,
  errorReason?: string | null,
): Promise<boolean> {
  const response = await authFetch(
    `${base()}/purchases/${encodeURIComponent(id)}/terminal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, errorReason: errorReason ?? null }),
    },
    walletAddress,
  );
  return response.ok;
}

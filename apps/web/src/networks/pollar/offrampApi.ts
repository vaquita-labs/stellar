'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { authFetch } from '@/networks/stellar/walletSession';

/**
 * Memoria del retiro en curso, del lado del servidor. Espejo de `onrampApi.ts`.
 *
 * La diferencia está en cuándo se abre: el USDC sale del vault en el primer
 * paso, antes de que el proveedor sepa nada, así que la fila se crea ANTES de
 * ese retiro y se va completando después. Un retiro que se cae en el medio deja
 * la fila sin id de proveedor, que es la señal de que hay plata en la wallet
 * que nunca llegó a la rampa.
 *
 * TODO lo de acá es best-effort a propósito: la wallet sale de la sesión y un
 * error nuestro de registro NUNCA puede tirar abajo un retiro que el proveedor
 * ya aceptó. Por eso cada función se traga sus errores y devuelve null/false.
 */

const base = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/offramp`;

/** Hasta dónde llegó el retiro. Mismos nombres que el stepper del modal. */
export type OfframpStep = 'funds' | 'create' | 'payout';

/** Cómo terminó, tal como lo guarda el servidor. */
export type TerminalOfframpStatus = 'settled' | 'failed' | 'abandoned';

export interface StartWithdrawalInput {
  country: string;
  amountFiat: string;
  currency: string;
  provider?: string | null;
  rail?: string | null;
  usdcAmount?: string | null;
}

export interface AdvanceWithdrawalInput {
  step?: OfframpStep;
  providerTxId?: string | null;
  provider?: string | null;
  rail?: string | null;
  usdcAmount?: string | null;
  vaultWithdrawHash?: string | null;
  paymentHash?: string | null;
}

/**
 * Abre el retiro antes de tocar el vault. Devuelve el id local, o null si no se
 * pudo registrar — en cuyo caso el retiro sigue igual, sólo que sin rastro.
 */
export async function startWithdrawal(walletAddress: string, input: StartWithdrawalInput): Promise<string | null> {
  try {
    const response = await authFetch(
      `${base()}/withdrawals`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
      walletAddress,
    );
    const data = (await response.json().catch(() => null)) as { data?: { id?: string } } | null;
    return data?.data?.id ?? null;
  } catch {
    return null;
  }
}

/** Anota el avance de un retiro abierto. Sin id no hay nada que anotar. */
export async function advanceWithdrawal(
  walletAddress: string,
  id: string | null,
  input: AdvanceWithdrawalInput,
): Promise<boolean> {
  if (!id) return false;
  try {
    const response = await authFetch(
      `${base()}/withdrawals/${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
      walletAddress,
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Cierra el retiro para que deje de aparecer como en curso. */
export async function markWithdrawalTerminal(
  walletAddress: string,
  id: string | null,
  status: TerminalOfframpStatus,
  errorReason?: string | null,
): Promise<boolean> {
  if (!id) return false;
  try {
    const response = await authFetch(
      `${base()}/withdrawals/${encodeURIComponent(id)}/terminal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, errorReason: errorReason ?? null }),
      },
      walletAddress,
    );
    return response.ok;
  } catch {
    return false;
  }
}

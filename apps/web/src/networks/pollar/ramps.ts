'use client';

import {
  isPollarApiError,
  type RampQuote as PollarRampQuote,
  type RampRail,
  type RampTxStatus,
  type RampsCompleteResponse,
  type RampsOfframpResponse,
  type RampsPendingSignature,
} from '@pollar/core';
import { getHorizonUrl } from '@/networks/stellar/kit';
import { usePollar } from '@pollar/react';
import { useCallback } from 'react';
import { waitForKycApproval as waitForApproval } from './kycWait';

/**
 * A `/ramps/quote` quote plus the amounts the response carries and
 * `@pollar/core` 0.11.3 does not type. All five come straight from the provider
 * and none of them can be reconstructed on this side:
 *
 * - `fiatAmount`: the fiat the quote actually settles, which is not necessarily
 *   the one that was asked for — the provider quotes on the crypto side, so
 *   asking for 12 BOB lands NEAR it, at 12.13. This is the amount to show,
 *   because it is what reaches the bank, and it is what `rate` is published
 *   against.
 * - `cryptoAmount`: the EXACT USDC debited from the wallet on an off-ramp. It is
 *   fixed at quote time and charged unchanged. `null` on an on-ramp.
 * - `expiresAt`: when Pollar's quote dies (15 minutes). This is the deadline
 *   that applies: past it, `SDK_RAMPS_QUOTE_EXPIRED`. Any countdown in the UI
 *   runs against this one.
 * - `providerExpiresAt`: when the provider's own quote dies (~60s), or `null`.
 *   Informational only: Pollar re-quotes with the same parameters when it
 *   creates the order, so the user can take as long as they want on the form
 *   and there is no deadline to beat.
 * - `availableAmount`: the fiat covered by the WALLET balance, or `null` when
 *   Pollar cannot read it. `null` is not zero, and neither value gates anything
 *   here: our balance lives in the vault and reaches the wallet only in step 1
 *   of the withdrawal, so this is always 0 or `null`.
 */
export type RampQuote = PollarRampQuote & {
  fiatAmount?: number | null;
  cryptoAmount?: number | null;
  expiresAt?: string | null;
  providerExpiresAt?: string | null;
  availableAmount?: number | null;
};

/** Corredores de off-ramp que la app expone hoy. */
export type CorridorCode = 'BR' | 'CO' | 'BO';

export interface Corridor {
  country: CorridorCode;
  /**
   * Moneda LOCAL del corredor (BRL, COP). Es con la que `/ramps/quote` filtra los
   * proveedores —compara contra el `fiat_currency` de cada corredor— y en la que
   * viaja el monto, así que también es la moneda en la que el usuario elige
   * cuánto quiere recibir. `getRampCountries` es la fuente de verdad.
   */
  currency: string;
  /** Símbolo para el input de monto. */
  symbol: string;
}

/**
 * El proveedor, el rail y los campos del formulario los decide Pollar por
 * cotización (Brasil sale por Pix, Colombia por PSE o Bre-B con Abroad, Bolivia
 * por ACH a la cuenta que cargue el usuario); de este lado sólo se fija cómo se
 * escribe el monto, y la moneda la pisa el server.
 *
 * OJO con Bolivia: que el país aparezca en `getRampCountries` NO dice que se
 * pueda retirar —esa lista trae país y moneda, sin dirección ni rail—, así que
 * lo único que lo confirma es una cotización `offramp` en BOB que vuelva con
 * quotes. Por eso el corredor queda detrás de flag hasta comprobarlo en
 * mainnet.
 */
export const CORRIDORS: Record<CorridorCode, Corridor> = {
  BR: { country: 'BR', currency: 'BRL', symbol: 'R$' },
  CO: { country: 'CO', currency: 'COP', symbol: '$' },
  BO: { country: 'BO', currency: 'BOB', symbol: 'Bs' },
};

/** Rails cuya liquidez publica Pollar; el resto no se puede consultar. */
const LIQUIDITY_RAILS: RampRail[] = ['PIX', 'BREB'];

export function isLiquidityRail(rail: string): rail is RampRail {
  return (LIQUIDITY_RAILS as string[]).includes(rail);
}

export class RampError extends Error {
  /** Código `SDK_RAMPS_*` de Pollar cuando el fallo viene de la API. */
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** Polling abortado a propósito (ej. el usuario cerró el modal). No es un error. */
export class RampCancelled extends RampError {}

/** Estados terminales de una transacción de ramp. */
export const RAMP_TERMINAL: RampTxStatus[] = ['completed', 'failed'];

/** Respuesta común de crear/reanudar/completar: las tres traen la misma forma. */
export type RampResult = RampsOfframpResponse | RampsCompleteResponse;

interface PollOpts {
  onStatus?: (status: RampTxStatus) => void;
  shouldStop?: () => boolean;
  intervalMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Código propio para un fallo de red: la petición no llegó a tener respuesta.
 * No sale de la API —de ahí el prefijo distinto— pero viaja por el mismo canal
 * que los de Pollar para que la UI lo traduzca igual que a cualquier otro.
 */
export const RAMP_NETWORK = 'RAMP_NETWORK';

/**
 * Envuelve cualquier fallo como `RampError` conservando el código de Pollar, que
 * es lo que la UI traduce a un mensaje entendible (cotización vencida, KYC
 * pendiente, monto fuera de límites…).
 *
 * De un error que no viene de Pollar se descarta el mensaje: `TypeError: Failed
 * to fetch` es del navegador, está en inglés y no dice qué hacer, así que gana
 * el texto que puso quien llama.
 */
export function asRampError(e: unknown, fallback: string): RampError {
  if (e instanceof RampError) return e;
  if (isPollarApiError(e)) return new RampError(e.details ?? e.message ?? fallback, e.code);
  return new RampError(fallback);
}

/**
 * Off-ramp de fiat sobre los endpoints de ramps de Pollar (`/ramps/*`). Pollar
 * hace de frente único: elige el anchor por corredor, corre el KYC del proveedor
 * y arma el pago on-chain del retiro, así que acá no hay ninguna API key de
 * proveedor ni proxy propio — todo va firmado con la sesión del usuario.
 *
 * Comparado con `useAnclap` (SEP-24 contra un anchor puntual), el flujo es:
 * cotizar → crear el retiro → resolver KYC/firma si el proveedor las pide →
 * completar el pago on-chain → esperar la liquidación.
 */
export function useRampOfframp() {
  const { getClient, signTx } = usePollar();

  /**
   * Corredor tal como lo publica Pollar para esta app, o `null` si el país no
   * está entre los habilitados. La moneda sale de acá y no de la constante local:
   * el server es quien manda sobre con qué se cotiza cada país.
   */
  const resolveCorridor = useCallback(
    async (country: CorridorCode): Promise<Corridor | null> => {
      try {
        const { countries } = await getClient().getRampCountries();
        const match = countries.find((c) => c.code === country);
        if (!match) return null;
        return { ...CORRIDORS[country], currency: match.currency ?? CORRIDORS[country].currency };
      } catch {
        // Sin lista no se puede afirmar que el corredor esté caído: se sigue con
        // la configuración local y el error real aparecerá al cotizar.
        return CORRIDORS[country];
      }
    },
    [getClient],
  );

  /**
   * Liquidez de un rail instantáneo (Pix en Brasil, Bre-B en Colombia). Se mira
   * con la cotización ya elegida, porque un corredor puede resolverse por más de
   * un rail —Colombia sale por PSE o por Bre-B— y bloquear por el que no
   * corresponde dejaría el retiro trabado sin motivo.
   */
  const railLiquidity = useCallback(
    async (rail: RampRail): Promise<{ available: boolean; message?: string }> => {
      try {
        const res = await getClient().getRampLiquidity(rail);
        return { available: res.available, message: res.message };
      } catch {
        // Un fallo del chequeo no debería bloquear el retiro: el error real, si lo
        // hay, va a aparecer al crear la transacción y ahí sí se muestra.
        return { available: true };
      }
    },
    [getClient],
  );

  /**
   * The corridor's off-ramp quotes, best first (Pollar already sorts them).
   * Quoting happens in the LOCAL CURRENCY the user wants to receive, not in the
   * USDC that leaves: `/ramps/quote` picks providers by matching `currency`
   * against the corridor's `fiat_currency`, so sending "USDC" matches none and
   * returns an empty list without even asking Abroad or Bridge.
   *
   * For the same reason `minAmount`/`maxAmount` and `rate` come in local
   * currency (`rate` = fiat per 1 USDC). The amounts to operate on are
   * `fiatAmount` and `cryptoAmount`, not the requested one and not a division by
   * `rate`.
   */
  const quoteFiat = useCallback(
    async (corridor: Corridor, amountFiat: number): Promise<RampQuote[]> => {
      try {
        const res = await getClient().getRampsQuote({
          country: corridor.country,
          amount: amountFiat,
          currency: corridor.currency,
          direction: 'offramp',
        });
        return res.quotes ?? [];
      } catch (e) {
        throw asRampError(e, 'No se pudieron obtener cotizaciones.');
      }
    },
    [getClient],
  );

  /**
   * Firma el XDR pendiente con la wallet y se lo devuelve a Pollar para que
   * siga. Sólo aparece en wallets EXTERNAS: las custodiales las firma el server.
   */
  const resumeWithSignature = useCallback(
    async (txId: string, pending: RampsPendingSignature): Promise<RampResult> => {
      const outcome = await signTx(pending.unsignedXdr);
      if (outcome.status !== 'signed') {
        throw new RampError(outcome.message ?? outcome.details ?? 'No se pudo firmar el retiro.');
      }
      try {
        return await getClient().submitRampSignature(txId, {
          signedXdr: outcome.signedXdr,
          action: pending.action,
        });
      } catch (e) {
        throw asRampError(e, 'Pollar rechazó la firma del retiro.');
      }
    },
    [getClient, signTx],
  );

  /** Resuelve en cadena todas las firmas pendientes que devuelva un resultado. */
  const settleSignatures = useCallback(
    async (result: RampResult): Promise<RampResult> => {
      let current = result;
      while (current.pendingSignature) {
        current = await resumeWithSignature(current.txId, current.pendingSignature);
      }
      return current;
    },
    [resumeWithSignature],
  );

  /**
   * Creates the withdrawal with an already chosen quote. The form values are
   * split the way the API expects them: the field carrying `bankType` is the
   * destination account (the Pix key, the PSE account…), the ones matching a
   * standard body key travel loose, and the rest go inside `fields`.
   *
   * Watch the order: for a CUSTODIAL wallet Pollar holds the keys and builds,
   * signs and sends the on-chain payment right here — the response already
   * carries `stellarTxHash` — without going through `completeWithdraw` or
   * publishing deposit instructions. So the USDC has to be in the wallet BEFORE
   * this call: otherwise there is nothing to pay with and the withdrawal sits in
   * `pending` with no hash. `quote.cryptoAmount` says exactly how much that is.
   */
  const createOfframp = useCallback(
    async (args: {
      corridor: Corridor;
      quote: RampQuote;
      amountFiat: number;
      walletAddress?: string;
      values: Record<string, string>;
    }): Promise<RampResult> => {
      const { corridor, quote, amountFiat, walletAddress, values } = args;
      const STANDARD_KEYS = new Set(['email', 'fullName', 'taxId', 'qrCode']);

      // The same amount/currency pair the quote was asked for: the REQUESTED
      // amount in local currency, not the one the quote settles. Pollar
      // re-quotes with these parameters when it creates the order, so sending
      // the settled figure (12.13 for the 12 that were asked) orders a different
      // withdrawal.
      //
      // How much USDC it charges is already fixed in `quote.cryptoAmount`, which
      // is what got funded into the wallet before reaching this point.
      const body: Parameters<ReturnType<typeof getClient>['createOffRamp']>[0] = {
        quoteId: quote.quoteId,
        amount: amountFiat,
        currency: corridor.currency,
        country: corridor.country,
      };
      if (walletAddress) body.walletAddress = walletAddress;

      const extra: Record<string, string> = {};
      for (const field of quote.requiredFields ?? []) {
        const value = (values[field.key] ?? '').trim();
        if (!value) continue;
        if (field.bankType) body.bankDetails = { type: field.bankType, value };
        else if (STANDARD_KEYS.has(field.key)) (body as Record<string, unknown>)[field.key] = value;
        else extra[field.key] = value;
      }
      if (Object.keys(extra).length > 0) body.fields = extra;

      try {
        return await settleSignatures(await getClient().createOffRamp(body));
      } catch (e) {
        throw asRampError(e, 'No se pudo iniciar el retiro.');
      }
    },
    [getClient, settleSignatures],
  );

  /**
   * Espera a que el proveedor apruebe el KYC. Cuando `createOfframp` responde
   * `kycRequired`, no se firmó nada ni se movió plata: hay que esperar el visto
   * bueno y volver a cotizar, porque la cotización original vence a los 15
   * minutos.
   */
  const waitForKycApproval = useCallback(
    async (opts: { shouldStop?: () => boolean; intervalMs?: number; timeoutMs?: number } = {}): Promise<void> => {
      const outcome = await waitForApproval({ ...opts, readStatus: () => getClient().getRampKycStatus() });
      if (outcome === 'cancelled') throw new RampCancelled('Seguimiento cancelado.');
      if (outcome === 'timeout') {
        throw new RampError('Se agotó el tiempo esperando la verificación. Volvé a intentar más tarde.');
      }
    },
    [getClient],
  );

  /**
   * Espera a que la transacción tenga `stellarTxHash`, o sea el acuse de que el
   * pago on-chain del retiro REALMENTE salió. `completeWithdraw` puede responder
   * 200 sin haberlo enviado, así que sin este chequeo el flujo se queda esperando
   * una liquidación que nunca va a llegar. `null` = no salió.
   */
  const waitForPaymentHash = useCallback(
    async (txId: string, opts: PollOpts = {}): Promise<string | null> => {
      const { onStatus, shouldStop, intervalMs = 4000, timeoutMs = 90_000 } = opts;
      const start = Date.now();
      for (;;) {
        if (shouldStop?.()) throw new RampCancelled('Seguimiento cancelado.');
        try {
          const tx = await getClient().getRampTransaction(txId);
          onStatus?.(tx.status);
          if (tx.status === 'failed') throw new RampError('El proveedor marcó el retiro como fallido.');
          if (tx.stellarTxHash) return tx.stellarTxHash;
          if (tx.status === 'completed') return null;
        } catch (e) {
          if (e instanceof RampError) throw e;
        }
        if (Date.now() - start > timeoutMs) return null;
        await sleep(intervalMs);
      }
    },
    [getClient],
  );

  /**
   * Dispara el pago on-chain del retiro. Sólo hace falta cuando el proveedor NO
   * lo envió al crear (wallets externas, o anchors que exigen el paso aparte):
   * con Abroad y wallet custodial el pago ya salió y esto no se llama.
   */
  const completeWithdraw = useCallback(
    async (txId: string): Promise<RampResult> => {
      try {
        return await settleSignatures(await getClient().completeWithdraw(txId));
      } catch (e) {
        throw asRampError(e, 'No se pudo completar el retiro.');
      }
    },
    [getClient, settleSignatures],
  );

  /**
   * Confirma contra Horizon que el pago on-chain que informó el proveedor existe
   * de verdad en un ledger.
   *
   * Hace falta porque `stellarTxHash` NO es prueba de que la plata se movió: el
   * proveedor devuelve el hash de la transacción que armó, y si esa transacción
   * nunca se difunde o se rechaza, el hash igual viene en la respuesta. Sin este
   * chequeo el retiro se queda esperando una acreditación que no va a llegar,
   * con el USDC quieto en la wallet y la UI diciendo "pago enviado".
   */
  const confirmOnLedger = useCallback(
    async (hash: string, opts: { shouldStop?: () => boolean; timeoutMs?: number } = {}): Promise<boolean> => {
      const { shouldStop, timeoutMs = 60_000 } = opts;
      const start = Date.now();
      for (;;) {
        if (shouldStop?.()) throw new RampCancelled('Seguimiento cancelado.');
        try {
          const res = await fetch(`${getHorizonUrl()}/transactions/${encodeURIComponent(hash)}`, { cache: 'no-store' });
          if (res.ok) {
            const tx = (await res.json()) as { successful?: boolean };
            // Un 200 con `successful: false` es una tx incluida pero fallida:
            // tampoco movió la plata.
            return tx.successful !== false;
          }
          if (res.status !== 404) return false;
        } catch {
          // Horizon caído o sin red: se reintenta hasta agotar la ventana.
        }
        // Los ledgers cierran cada ~5s; con eso alcanza para verla aparecer.
        if (Date.now() - start > timeoutMs) return false;
        await sleep(5000);
      }
    },
    [],
  );

  /**
   * Sigue la transacción hasta que el proveedor liquida. Devuelve el último estado
   * conocido: `completed` si liquidó, y el que haya (`pending`/`processing`) si se
   * agotó la ventana de seguimiento.
   *
   * Agotar la ventana NO es un error y por eso no tira: para cuando esto corre, el
   * pago on-chain ya salió y lo que falta es la acreditación del proveedor, que
   * puede tardar mucho más que nuestro polling. Tratarlo como fallo le mostraría
   * al usuario un retiro roto que en realidad está en camino.
   *
   * El intervalo se estira con el tiempo: los primeros minutos importan (el estado
   * cambia rápido), después son cientos de requests para mirar un número que no se
   * mueve.
   */
  const waitForPayout = useCallback(
    async (txId: string, opts: PollOpts = {}): Promise<RampTxStatus> => {
      const { onStatus, shouldStop, intervalMs = 6000, timeoutMs = 20 * 60 * 1000 } = opts;
      const start = Date.now();
      let last: RampTxStatus = 'pending';
      for (;;) {
        if (shouldStop?.()) throw new RampCancelled('Seguimiento cancelado.');
        try {
          const tx = await getClient().getRampTransaction(txId);
          last = tx.status;
          onStatus?.(tx.status);
          if (tx.status === 'failed') throw new RampError('El proveedor marcó el retiro como fallido.');
          if (tx.status === 'completed') return tx.status;
        } catch (e) {
          if (e instanceof RampError) throw e;
          // Un error de lectura puntual no cancela el seguimiento.
        }
        const elapsed = Date.now() - start;
        if (elapsed > timeoutMs) return last;
        // Ritmo original los primeros 2 minutos; 30s de ahí en adelante.
        await sleep(elapsed > 2 * 60 * 1000 ? Math.max(intervalMs, 30_000) : intervalMs);
      }
    },
    [getClient],
  );

  return {
    resolveCorridor,
    railLiquidity,
    quoteFiat,
    createOfframp,
    waitForKycApproval,
    completeWithdraw,
    waitForPaymentHash,
    confirmOnLedger,
    waitForPayout,
  };
}

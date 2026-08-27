'use client';

import {
  isPollarApiError,
  type RampQuote,
  type RampRail,
  type RampTxStatus,
  type RampsCompleteResponse,
  type RampsOfframpResponse,
  type RampsPendingSignature,
} from '@pollar/core';
import { getHorizonUrl } from '@/networks/stellar/kit';
import { usePollar } from '@pollar/react';
import { useCallback } from 'react';

/** Corredores de off-ramp que la app expone hoy. */
export type CorridorCode = 'BR' | 'CO';

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
 * cotización (Brasil sale por Pix, Colombia por PSE o Bre-B con Abroad); de este
 * lado sólo se fija cómo se escribe el monto, y la moneda la pisa el server.
 */
export const CORRIDORS: Record<CorridorCode, Corridor> = {
  BR: { country: 'BR', currency: 'BRL', symbol: 'R$' },
  CO: { country: 'CO', currency: 'COP', symbol: '$' },
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
 * Envuelve cualquier fallo como `RampError` conservando el código de Pollar, que
 * es lo que la UI traduce a un mensaje entendible (cotización vencida, KYC
 * pendiente, monto fuera de límites…).
 */
export function asRampError(e: unknown, fallback: string): RampError {
  if (e instanceof RampError) return e;
  if (isPollarApiError(e)) return new RampError(e.details ?? e.message ?? fallback, e.code);
  return new RampError((e as Error)?.message || fallback);
}

/**
 * Cuánto USDC cuesta recibir `amountFiat` en moneda local, según la cotización.
 * `rate` viene como FIAT POR 1 USDC, así que el costo es la división.
 *
 * Es la ÚNICA forma de saberlo antes de crear el retiro, y hace falta antes
 * porque el USDC tiene que estar en la wallet para que el proveedor pueda
 * cobrarlo. Los proveedores que usamos no publican instrucciones de depósito con
 * un monto exacto, así que quien la llama redondea hacia arriba para no quedar
 * corto y valida el resultado contra el saldo.
 */
export function usdcCostOf(amountFiat: number, quote: Pick<RampQuote, 'rate'>): number | null {
  const rate = Number(quote.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const cost = amountFiat / rate;
  return Number.isFinite(cost) && cost > 0 ? cost : null;
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
   * Cotizaciones del off-ramp del corredor, mejor primero (Pollar ya las ordena).
   * Se cotiza por la MONEDA LOCAL que el usuario quiere recibir, no por el USDC
   * que sale: `/ramps/quote` elige los proveedores comparando `currency` contra el
   * `fiat_currency` del corredor, así que mandar "USDC" no matchea ninguno y
   * devuelve la lista vacía sin siquiera consultar a Abroad ni a Bridge.
   *
   * Por lo mismo, `minAmount`/`maxAmount` y `rate` de cada cotización vienen en
   * moneda local (`rate` = fiat por 1 USDC).
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
   * Crea el retiro con una cotización ya elegida. Los valores del formulario se
   * reparten como espera la API: el campo con `bankType` es la cuenta de destino
   * (la chave Pix, la cuenta PSE…), los que coinciden con una clave estándar del
   * body van sueltos, y el resto viaja en `fields`.
   *
   * OJO con el orden: para una wallet CUSTODIAL, Pollar tiene las llaves y arma,
   * firma y envía el pago on-chain acá mismo —la respuesta ya vuelve con
   * `stellarTxHash`—, sin pasar por `completeWithdraw` ni publicar instrucciones
   * de depósito. Así que el USDC tiene que estar en la wallet ANTES de llamar a
   * esto: si no, no hay con qué pagar y el retiro queda en `pending` sin hash.
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

      // Mismo par monto/moneda con el que se cotizó: la moneda local que el
      // usuario va a recibir. Cuánto USDC cuesta lo resuelve el proveedor y lo
      // publica en las instrucciones de depósito de la transacción.
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
      const { shouldStop, intervalMs = 10_000, timeoutMs = 30 * 60 * 1000 } = opts;
      const start = Date.now();
      for (;;) {
        if (shouldStop?.()) throw new RampCancelled('Seguimiento cancelado.');
        try {
          const { hasApproved } = await getClient().getRampKycStatus();
          if (hasApproved) return;
        } catch {
          // Todavía sin registro del usuario en el proveedor: se sigue esperando.
        }
        if (Date.now() - start > timeoutMs) {
          throw new RampError('Se agotó el tiempo esperando la verificación. Volvé a intentar más tarde.');
        }
        await sleep(intervalMs);
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

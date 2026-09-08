'use client';

import type { RampsOnrampResponse, RampsTransactionResponse } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { useCallback } from 'react';
import { getBlendConfig } from '@/networks/stellar/blendDirect';
import { getHorizonUrl } from '@/networks/stellar/kit';
import { asRampError, RAMP_NETWORK, type RampQuote, RampError } from './ramps';

/**
 * Corredores de ON-ramp que la app expone hoy. Son otro conjunto que los de
 * off-ramp (`CorridorCode` en `ramps.ts`): que un país deje sacar plata no
 * implica que deje meterla, así que los tipos van separados a propósito —
 * pasarle "BR" a este módulo no debería compilar.
 */
export type OnrampCorridorCode = 'BO';

/** Cuántas veces se lee una cuenta en Horizon antes de darla por inalcanzable. */
const HORIZON_ATTEMPTS = 3;
/** Espera entre intentos, multiplicada por el número de intento. */
const HORIZON_BACKOFF_MS = 300;
/** Techo de cada intento: sin esto una red a medio morir nunca resuelve. */
const HORIZON_TIMEOUT_MS = 10_000;

export interface OnrampCorridor {
  country: OnrampCorridorCode;
  /**
   * Moneda LOCAL del corredor (BOB). Es con la que `/ramps/quote` filtra los
   * proveedores y en la que viaja el monto, así que también es la moneda en la
   * que el usuario elige cuánto quiere gastar. `getRampCountries` manda.
   */
  currency: string;
  /** Símbolo para el input de monto. */
  symbol: string;
  /**
   * Floor for a purchase, in local currency. Nothing below it is quoted.
   *
   * It is OUR floor, not the route's: a quote's `minAmount` only exists once
   * there IS a quote, and under this amount the provider returns none — an
   * empty list carries no number to show, so the screen can only say no route
   * fits and leave the user guessing which amount does.
   */
  minFiat: number;
}

/**
 * Bolivia sale por Stereum con rail QR: el proveedor devuelve un QR
 * interoperable que el usuario paga desde la app de su banco. El proveedor, el
 * rail y los campos del formulario los decide Pollar por cotización; de este
 * lado sólo se fija cómo se escribe el monto, y la moneda la pisa el server.
 *
 * OJO: el corredor existe SÓLO en mainnet. En testnet `getRampCountries` no lo
 * lista y las cotizaciones vuelven vacías.
 */
export const ONRAMP_CORRIDORS: Record<OnrampCorridorCode, OnrampCorridor> = {
  BO: { country: 'BO', currency: 'BOB', symbol: 'Bs', minFiat: 2 },
};

/**
 * How much USDC `amountFiat` in local currency buys, per the quote. `rate` comes
 * as FIAT PER 1 USDC, so the incoming USDC is the division.
 *
 * Dividing is valid here: `cryptoAmount` is `null` on an on-ramp — the provider
 * only fixes it when it credits — and nothing is pre-funded, so a cent of
 * difference breaks no payment.
 *
 * It is an estimate: the provider confirms the final amount when it credits, and
 * it can move if the QR is paid long after the quote.
 */
export function usdcOutOf(amountFiat: number, quote: Pick<RampQuote, 'rate'>): number | null {
  const rate = Number(quote.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const out = amountFiat / rate;
  return Number.isFinite(out) && out > 0 ? out : null;
}

/**
 * On-ramp de fiat sobre los endpoints de ramps de Pollar (`/ramps/*`), el
 * espejo de `useRampOfframp`. Pollar hace de frente único: elige el proveedor
 * por corredor, corre el KYC si hace falta y devuelve las instrucciones de pago,
 * así que acá no hay ninguna API key de proveedor ni proxy propio — todo va
 * firmado con la sesión del usuario.
 *
 * Esta primera parte cubre hasta la cotización: elegir país → cotizar el monto
 * en moneda local → ver cuánto USDC entra, con qué comisión y en cuánto tiempo.
 */
export function useRampOnramp() {
  const { getClient, setTrustline } = usePollar();

  /**
   * Corredor tal como lo publica Pollar para esta app, o `null` si el país no
   * está entre los habilitados. La moneda sale de acá y no de la constante
   * local: el server es quien manda sobre con qué se cotiza cada país.
   */
  const resolveCorridor = useCallback(
    async (country: OnrampCorridorCode): Promise<OnrampCorridor | null> => {
      try {
        const { countries } = await getClient().getRampCountries();
        const match = countries.find((c) => c.code === country);
        if (!match) return null;
        return { ...ONRAMP_CORRIDORS[country], currency: match.currency ?? ONRAMP_CORRIDORS[country].currency };
      } catch {
        // Sin lista no se puede afirmar que el corredor esté caído: se sigue con
        // la configuración local y el error real aparecerá al cotizar.
        return ONRAMP_CORRIDORS[country];
      }
    },
    [getClient],
  );

  /**
   * Cotizaciones de compra del corredor, mejor primero (Pollar ya las ordena).
   * Se cotiza por la MONEDA LOCAL que el usuario va a pagar, no por el USDC que
   * recibe: `/ramps/quote` elige los proveedores comparando `currency` contra el
   * `fiat_currency` del corredor, así que mandar "USDC" no matchea ninguno y
   * devuelve la lista vacía.
   *
   * Por lo mismo, `minAmount`/`maxAmount` y `rate` de cada cotización vienen en
   * moneda local (`rate` = fiat por 1 USDC).
   */
  const quoteFiat = useCallback(
    async (corridor: OnrampCorridor, amountFiat: number): Promise<RampQuote[]> => {
      try {
        const res = await getClient().getRampsQuote({
          country: corridor.country,
          amount: amountFiat,
          currency: corridor.currency,
          direction: 'onramp',
        });
        return res.quotes ?? [];
      } catch (e) {
        throw asRampError(e, 'No se pudieron obtener cotizaciones.');
      }
    },
    [getClient],
  );

  /**
   * Deja la wallet en condiciones de RECIBIR el USDC antes de crear la compra.
   *
   * Es el paso más importante del flujo y va primero a propósito: si el QR se
   * emite contra una wallet sin trustline, el usuario paga bolivianos reales y
   * el proveedor no tiene dónde acreditar. Falla ruidosamente — no crear la
   * compra es siempre mejor que crearla sin dónde entregar.
   *
   * La trustline la paga la app (sponsorship de Pollar queda encendido), así que
   * un usuario que nunca tuvo XLM puede comprar igual.
   */
  const ensureUsdcTrustline = useCallback(
    async (walletAddress: string): Promise<void> => {
      const issuer = getBlendConfig()?.usdcIssuer;
      if (!issuer) {
        throw new RampError('No hay un USDC configurado para esta red.');
      }
      // Se pregunta a Horizon y no al estado de Pollar: ese estado se queda viejo
      // dentro del mismo handler async y volvería a pedir la trustline cada vez.
      if (await accountHasTrustline(walletAddress, 'USDC', issuer)) return;

      const outcome = await setTrustline({ code: 'USDC', issuer });
      if (outcome.status === 'error') {
        throw new RampError(outcome.details ?? 'No se pudo activar la trustline de USDC.');
      }
    },
    [setTrustline],
  );

  /**
   * Crea la compra con una cotización ya elegida y devuelve las instrucciones de
   * pago (el QR entre ellas).
   *
   * Del formulario sólo viajan las claves que el body de on-ramp acepta: a
   * diferencia del off-ramp, `/ramps/onramp` no tiene `fields` ni `bankDetails`
   * —el usuario no entrega una cuenta de destino, paga un QR—, así que cualquier
   * otro campo que pida la cotización no tiene dónde ir.
   */
  const createOnramp = useCallback(
    async (args: {
      corridor: OnrampCorridor;
      quote: RampQuote;
      amountFiat: number;
      walletAddress?: string;
      values: Record<string, string>;
    }): Promise<RampsOnrampResponse> => {
      const { corridor, quote, amountFiat, walletAddress, values } = args;

      const body: Parameters<ReturnType<typeof getClient>['createOnRamp']>[0] = {
        quoteId: quote.quoteId,
        amount: amountFiat,
        currency: corridor.currency,
        country: corridor.country,
      };
      if (walletAddress) body.walletAddress = walletAddress;
      const email = (values.email ?? '').trim();
      const fullName = (values.fullName ?? '').trim();
      if (email) body.email = email;
      if (fullName) body.fullName = fullName;

      try {
        return await getClient().createOnRamp(body);
      } catch (e) {
        throw asRampError(e, 'No se pudo iniciar la compra.');
      }
    },
    [getClient],
  );

  /**
   * Estado actual de la compra según el proveedor, con las instrucciones de pago
   * incluidas.
   *
   * Es lo que hace posible retomar desde otro dispositivo: alcanza con el id de
   * transacción para volver a tener el QR, los datos y el vencimiento, sin nada
   * guardado localmente.
   */
  const readOnrampTransaction = useCallback(
    async (txId: string): Promise<RampsTransactionResponse> => {
      try {
        return await getClient().getRampTransaction(txId);
      } catch (e) {
        throw asRampError(e, 'No se pudo consultar el estado de la compra.');
      }
    },
    [getClient],
  );

  /**
   * Dónde está parada la verificación de identidad del usuario con el proveedor
   * de ramps.
   *
   * Se expone cruda —sin espera adentro— porque quién decide cuánto esperar y
   * cuándo cortar es la pantalla, que es la única que sabe si sigue abierta.
   */
  const readKycStatus = useCallback(async (): Promise<{ hasApproved: boolean }> => {
    return await getClient().getRampKycStatus();
  }, [getClient]);

  /**
   * How much USDC the purchase actually credited, per the ledger. Lives on the
   * hook so callers do not have to know which issuer counts as USDC here.
   */
  const readCreditedUsdc = useCallback(async (hash: string, walletAddress: string): Promise<number | null> => {
    const issuer = getBlendConfig()?.usdcIssuer;
    if (!issuer) return null;
    return creditedUsdcFor(hash, walletAddress, issuer);
  }, []);

  return {
    resolveCorridor,
    quoteFiat,
    ensureUsdcTrustline,
    createOnramp,
    readOnrampTransaction,
    readKycStatus,
    readCreditedUsdc,
  };
}

/**
 * The USDC that actually landed, read off the ledger.
 *
 * The provider never reports it. Its transaction carries `amount` and
 * `currency`, and on a purchase those are the BOLIVIANOS that were paid — there
 * is no field for the credited crypto anywhere in the response. What it does
 * carry is `stellarTxHash`, and the payment is right there in that transaction.
 *
 * Every matching payment is summed: one transaction can carry more than one, and
 * taking only the first would under-report what arrived.
 *
 * `null` means the figure cannot be affirmed — Horizon unreachable, or no USDC
 * payment to this wallet in that transaction. It is a result, not a failure: the
 * screen then says the money landed without naming an amount, which is the whole
 * point of reading this instead of showing the quote's estimate.
 */
export async function creditedUsdcFor(hash: string, account: string, issuer: string): Promise<number | null> {
  const res = await horizonGet(`${getHorizonUrl()}/transactions/${encodeURIComponent(hash)}/payments?limit=200`).catch(
    () => null,
  );
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    _embedded?: { records?: Array<{ to?: string; asset_code?: string; asset_issuer?: string; amount?: string }> };
  } | null;
  const credited = (body?._embedded?.records ?? [])
    .filter((r) => r.to === account && r.asset_code?.toUpperCase() === 'USDC' && r.asset_issuer === issuer)
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  return Number.isFinite(credited) && credited > 0 ? credited : null;
}

/** ¿La cuenta ya tiene la trustline del asset? Cuenta inexistente = no. */
async function accountHasTrustline(account: string, code: string, issuer: string): Promise<boolean> {
  const res = await readAccount(account);
  if (res.status === 404) return false;
  if (!res.ok) throw new RampError(`No se pudo leer la cuenta en Horizon (HTTP ${res.status}).`);
  const data = (await res.json()) as { balances?: Array<{ asset_code?: string; asset_issuer?: string }> };
  return (data.balances ?? []).some((b) => b.asset_code?.toUpperCase() === code.toUpperCase() && b.asset_issuer === issuer);
}

/**
 * La cuenta en Horizon, reintentando mientras el fallo sea de red.
 *
 * Es un GET idempotente, así que insistir no cuesta nada y evita cortar una
 * compra sana: un parpadeo de red de un segundo acá tira abajo todo el flujo
 * antes de que el proveedor llegue a emitir el código de pago.
 *
 * El timeout es la otra mitad. Sin él una red a medio morir deja la promesa
 * colgada para siempre y el botón girando, que para el usuario es peor que un
 * error: no tiene nada que reintentar.
 *
 * Sólo se reintentan los fallos de red. Un HTTP que llegó —incluido el 404 de
 * cuenta inexistente— es una respuesta y la decide quien llama.
 */
async function readAccount(account: string): Promise<Response> {
  return horizonGet(`${getHorizonUrl()}/accounts/${encodeURIComponent(account)}`);
}

/** The retrying GET itself, shared by every Horizon read in this module. */
async function horizonGet(url: string): Promise<Response> {
  for (let attempt = 0; attempt < HORIZON_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, HORIZON_BACKOFF_MS * attempt));
    try {
      return await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(HORIZON_TIMEOUT_MS) });
    } catch {
      // El error del navegador (`TypeError: Failed to fetch`) no le dice nada a
      // nadie, así que se descarta y el último intento tira el nuestro.
    }
  }
  throw new RampError('No se pudo llegar a Horizon.', RAMP_NETWORK);
}

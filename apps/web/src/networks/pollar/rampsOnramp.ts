'use client';

import type { RampQuote } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { useCallback } from 'react';
import { asRampError } from './ramps';

/**
 * Corredores de ON-ramp que la app expone hoy. Son otro conjunto que los de
 * off-ramp (`CorridorCode` en `ramps.ts`): que un país deje sacar plata no
 * implica que deje meterla, así que los tipos van separados a propósito —
 * pasarle "BR" a este módulo no debería compilar.
 */
export type OnrampCorridorCode = 'BO';

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
  BO: { country: 'BO', currency: 'BOB', symbol: 'Bs' },
};

/**
 * Cuánto USDC deja `amountFiat` en moneda local, según la cotización. `rate`
 * viene como FIAT POR 1 USDC —igual que en el off-ramp—, así que el USDC que
 * entra es la división.
 *
 * Es una estimación: el monto final lo confirma el proveedor cuando acredita, y
 * puede moverse si el QR se paga mucho después de cotizar.
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
  const { getClient } = usePollar();

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

  return { resolveCorridor, quoteFiat };
}

'use client';

import { usePollarReadyStore } from '@/networks/stellar/wallet/pollarReady';
import type { RampsCountriesResponse } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Qué países tiene habilitados Pollar para ramps con NUESTRAS credenciales.
 *
 * Reemplaza a los flags de build que teníamos por corredor: la lista la publica
 * el proveedor y cambia sin que nosotros redeployemos, así que preguntar es más
 * fiel que recordar. De paso arregla solo el caso de testnet —ahí Bolivia no
 * está en la lista y las cotizaciones vuelven vacías—, que con el flag prendido
 * mostraba un país al que se podía entrar para no poder comprar nada.
 *
 * OJO con lo que este endpoint NO dice: `/ramps/countries` devuelve `{ code,
 * currency }` y nada más. No trae dirección ni rails, así que no distingue
 * compra de venta y una sola lista termina gobernando las dos puntas del mismo
 * país. Sirve para APAGAR un corredor —el que no está no opera en ninguna
 * dirección— pero no alcanza para afirmar que uno que está tenga las dos.
 */

/** Códigos ISO en mayúsculas, sin repetidos ni basura. */
export function rampCountryCodes(response: RampsCountriesResponse | null | undefined): string[] {
  const codes = (response?.countries ?? [])
    .map((country) => country?.code?.trim().toUpperCase())
    .filter((code): code is string => !!code);
  return [...new Set(codes)];
}

/**
 * Cuánto vale la lista antes de volver a pedirla. Es alta a propósito: un país
 * se habilita del lado del proveedor cada varios meses, y el usuario que abre el
 * picker dos veces seguidas no tiene por qué pagar dos requests.
 */
export const RAMP_COUNTRIES_STALE_MS = 10 * 60 * 1000;

export interface RampCountriesGate {
  /** `true` mientras todavía no se sabe (la respuesta no llegó). */
  isLoading: boolean;
  /** ¿El proveedor tiene ese país habilitado? Sin respuesta, no. */
  supports: (country: string) => boolean;
}

/**
 * La lista de países del proveedor, para decidir qué corredores se ofrecen.
 *
 * Falla CERRADO: mientras carga, y si la llamada se cae, `supports` devuelve
 * false y el país queda "próximamente". Es lo contrario de `resolveCorridor`,
 * que ante un error sigue con la config local — y la diferencia es a propósito:
 * ahí el usuario ya eligió su país y el error real le va a llegar al cotizar,
 * mientras que acá dejarlo entrar a un corredor que no existe es mandarlo a una
 * pantalla sin salida. Un país de menos se arregla reintentando; un país de más
 * se arregla perdiendo el tiempo.
 *
 * @param enabled dejar en `false` mientras no haga falta, para no pedir la lista
 * en cada home. Se pide cuando el usuario abre alguna puerta de fiat.
 */
export function useRampCountries(enabled = true): RampCountriesGate {
  const { getClient } = usePollar();
  // La llamada va firmada con la sesión: sin DPoP restaurado responde 401 y
  // gastaríamos un reintento en algo que todavía no podía funcionar.
  const ready = usePollarReadyStore((s) => s.ready);

  const { data, isPending } = useQuery({
    queryKey: ['pollar', 'ramp-countries'],
    queryFn: async () => rampCountryCodes(await getClient().getRampCountries()),
    enabled: enabled && ready,
    staleTime: RAMP_COUNTRIES_STALE_MS,
  });

  const supports = useCallback((country: string) => !!data?.includes(country.trim().toUpperCase()), [data]);

  return { isLoading: isPending, supports };
}

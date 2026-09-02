export const ONE_SECOND = 1000;
export const ONE_MINUTE = ONE_SECOND * 60;
export const ONE_HOUR = ONE_MINUTE * 60;
export const ONE_DAY = ONE_HOUR * 24;

export const HISTORICAL_DELAY = ONE_MINUTE;

/**
 * Monto mínimo (en USDC) para mover plata en la app: depositar, retirar, poner a
 * rendir. El backend es la autoridad y rechaza el request; el front replica la
 * regla como `MIN_USDC` (apps/web helpers/numbers.ts) sólo para avisar antes.
 *
 * 0,1 y no 1: el mínimo de la app tiene que ser el más chico que la cadena
 * acepte, no un número redondo. Los pisos reales medidos sobre mainnet el 2 de
 * septiembre de 2026 son ~0,000001 USDC en el vault de DeFindex y ~0,0001 en
 * Blend (apps/api/tmp/2026-09-02-vault-min-dust.ts), así que 0,1 sigue estando
 * tres órdenes de magnitud arriba y deja margen de sobra.
 *
 * Si cambia una, cambiá la otra.
 */
export const MIN_USDC_AMOUNT = 0.1;

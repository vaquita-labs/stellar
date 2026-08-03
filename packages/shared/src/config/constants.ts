export const ONE_SECOND = 1000;
export const ONE_MINUTE = ONE_SECOND * 60;
export const ONE_HOUR = ONE_MINUTE * 60;
export const ONE_DAY = ONE_HOUR * 24;

export const HISTORICAL_DELAY = ONE_MINUTE;

/**
 * Monto mínimo (en USDC) para depositar y retirar. El backend es la autoridad:
 * rechaza cualquier depósito/retiro < 1 USDC. El front replica la regla como
 * `MIN_USDC` (apps/web helpers/numbers.ts) para UX; si cambia una, cambiá la otra.
 */
export const MIN_USDC_AMOUNT = 1;

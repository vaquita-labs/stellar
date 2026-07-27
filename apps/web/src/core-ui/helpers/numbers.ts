export function isHex32(str: string) {
  return /^[0-9a-fA-F]{32}$/.test(str);
}

export async function toHexFromAny(input: number, size: number): Promise<string> {
  const data = new TextEncoder().encode(input + '');
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  const bytes = new Uint8Array(digest).slice(0, size / 2);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const formatAmount = (amount: number, tokenSymbol: string) => {
  return `${formatTokenPrecise(amount)} ${tokenSymbol}`;
};

/**
 * Monto en dólares con separador de miles: $3,806.22. Los saldos del portfolio
 * pueden tener cuatro cifras o más y sin separador se leen mal de un vistazo.
 */
export const formatUsd = (amount: number) =>
  `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Decimales que mostramos/permitimos al mover plata. USDC son 7 on-chain (los
 * montos son `raw / 10^7`), así que usamos 7 para representar CADA valor posible
 * sin perder el último dígito. Cambiarlo acá lo cambia en todos los flujos de
 * monto (depósito, retiro, invertir, mover) y sus displays.
 */
export const AMOUNT_DECIMALS = 7;

/**
 * Piso a `digits` decimales, robusto ante el ruido binario del float. `num*10^d`
 * arrastra error —`0.29 * 1e7 = 2899999.999…`— y un truncado directo bajaría el
 * último decimal (0.29 → 0.2899999). Sumamos un epsilon MAYOR a ese ruido
 * (≈|scaled|·2⁻⁵²) pero MUCHO MENOR al dígito real más chico (1.0 en el paso
 * escalado cuando pisamos a los 7 decimales nativos de USDC), así nunca
 * redondeamos hacia arriba un valor genuino: 5.9999995 sigue pisando, no sube.
 * Pensado para saldos de la app (magnitudes « $1M); montos enormes exceden la
 * precisión de un float de todos modos.
 */
export const floorAmount = (num: number, digits = AMOUNT_DECIMALS): number => {
  if (!Number.isFinite(num) || num === 0) return 0;
  const factor = Math.pow(10, digits);
  const scaled = num * factor;
  const eps = Math.sign(scaled) * (Math.abs(scaled) * 2 ** -44 + 1e-9);
  return Math.trunc(scaled + eps) / factor;
};

/**
 * Dólares con TODA la precisión que tenga el saldo (hasta 6 decimales), sin
 * redondear hacia arriba: mínimo 2 decimales ($4.00) y hasta 6 cuando el saldo
 * los tiene ($3.001234). Pisamos con `floorAmount` (nunca hacia arriba) antes de
 * formatear, mismo criterio que el header y el "Available" del retiro.
 */
export const formatUsdPrecise = (amount: number, maxDecimals = AMOUNT_DECIMALS) =>
  `$${formatTokenPrecise(amount, maxDecimals)}`;

/** Igual que `formatUsdPrecise` pero sin el `$` (para pegarle un símbolo de token al lado). */
export const formatTokenPrecise = (amount: number, maxDecimals = AMOUNT_DECIMALS) =>
  floorAmount(amount, maxDecimals).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });

/**
 * Pisa a `digits` decimales y devuelve un string limpio para prellenar el
 * teclado (sin ceros de cola ni ruido de float): 4 → "4", 3.001234 → "3.001234".
 * Se usa en el botón "Available/Max" para teclear el saldo exacto retirable.
 */
export const truncatedAmountString = (amount: number, digits = AMOUNT_DECIMALS) =>
  floorAmount(amount, digits)
    .toFixed(digits)
    .replace(/\.?0+$/, '');

export const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

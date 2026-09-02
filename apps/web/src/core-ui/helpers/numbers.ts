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
 * Monto mínimo (en USDC) para mover plata: depositar, retirar, poner a rendir.
 * Es la MISMA regla que valida el backend (`MIN_USDC_AMOUNT` en @vaquita/shared);
 * si cambia una, cambiá la otra. El front la usa para deshabilitar y avisar; el
 * back es la autoridad que rechaza el request.
 *
 * Se declara como string y se deriva el número, no al revés: el gate de ejecución
 * compara en unidades base y `toBaseUnits('0.1', 7)` es exacto, mientras que
 * `String(0.1)` depende de cómo imprima el float. Un solo lugar donde tocarlo.
 */
export const MIN_USDC_STR = '0.1';
export const MIN_USDC = Number(MIN_USDC_STR);

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
 * Decimales adaptados a la magnitud, para SALDOS que se muestran en grande (el
 * titular del portfolio, el número del detalle de Blend). Un saldo de tres o más
 * cifras con los 7 decimales de USDC (`722.0121232`) no cabe en un número gigante
 * y rompe el layout con scroll horizontal; ahí 2 decimales alcanzan y se leen de
 * un vistazo. Los saldos chicos conservan la precisión fina, que es justo donde
 * importa (micro-ganancias, centavos). Umbral en 100: por debajo se ve completo
 * (`10.4699999`), por encima se redondea a 2 (`722.01`). Nunca redondea hacia
 * arriba (usa el mismo piso que el resto).
 */
export const formatTokenAdaptive = (amount: number) =>
  formatTokenPrecise(amount, Math.abs(amount) >= 100 ? 2 : AMOUNT_DECIMALS);

/** Igual que `formatTokenAdaptive` pero con el `$` delante. */
export const formatUsdAdaptive = (amount: number) => `$${formatTokenAdaptive(amount)}`;

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

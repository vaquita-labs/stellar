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
 * Decimales del monto en MONEDA LOCAL (los ramps). No es `AMOUNT_DECIMALS`: acá
 * el usuario teclea pesos/bolivianos, y ningún proveedor de fiat cotiza más allá
 * del centavo. Es el mismo 2 para tipear el monto y para mostrar la cotización.
 */
export const FIAT_DECIMALS = 2;

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
 * DUST floor for money that lands on its own: the balance from which we offer to
 * put it to work, and the one promised to whoever receives USDC at their address.
 *
 * Much lower than `MIN_USDC` because it answers a different question. `MIN_USDC`
 * is the amount rule the backend validates when the user TYPES how much to move;
 * here nothing is typed — the whole balance goes in — and the supply is signed
 * entirely in the browser, so all this number protects is the fee of a
 * transaction that moves dust. The app sponsors that fee.
 *
 * The chain's own floors sit far below: ~0.0001 USDC on Blend and ~0.000001 on
 * the DeFindex vault, measured on mainnet (see `MIN_USDC_AMOUNT` in
 * @vaquita/shared).
 *
 * A 2 BOB purchase — the Bolivian corridor's minimum — delivers ~0.08 USDC, and
 * that is the case this floor has to let through.
 */
export const MIN_IDLE_USDC_STR = '0.005';
export const MIN_IDLE_USDC = Number(MIN_IDLE_USDC_STR);

/**
 * Decimals needed to write `MIN_IDLE_USDC` out in full. Derived from the string
 * because the format helpers FLOOR: at the 2 decimals the rest of the screens
 * use, "0.005" renders as "0.00" and the message claims the minimum is zero.
 */
export const MIN_IDLE_USDC_DECIMALS = (MIN_IDLE_USDC_STR.split('.')[1] ?? '').length;

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

/** Decimales para un monto por debajo de 1: ver `formatTokenFine`. */
const FINE_DECIMALS = 4;

/**
 * A figure of money the reader has to be able to reconcile with their balance:
 * the usual two decimals from 1 up, four below it.
 *
 * The floor is what forces this. Two decimals on 0.079976 print "0.07" and throw
 * away an eighth of the money, which on a purchase of a few cents is the
 * difference between the number on the screen and the number in the wallet. Four
 * decimals keep it readable and keep it true.
 *
 * Above 1 nothing changes: there the cent is already the smallest unit anyone
 * reads, and trailing digits only make the figure harder to take in.
 */
export const formatTokenFine = (amount: number) => formatTokenPrecise(amount, Math.abs(amount) < 1 ? FINE_DECIMALS : 2);

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

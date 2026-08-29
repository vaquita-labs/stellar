/**
 * Memoria del servidor sobre un retiro a moneda local en curso.
 *
 * Espejo de `services/onramp/purchases.ts`, con una diferencia que define toda
 * la forma del módulo: en el off-ramp el USDC sale del vault ANTES de que el
 * proveedor sepa nada del retiro. La fila se abre antes de ese primer paso, así
 * que `providerTxId` y `provider` nacen vacíos y puede que nunca se llenen —
 * una fila así es un retiro que movió plata del usuario y no llegó a la rampa,
 * que es exactamente el caso que esto existe para no perder.
 *
 * Todo se define contra {@link OfframpWithdrawalRepository} y no contra Prisma,
 * así que el servicio se prueba entero con un fake en memoria.
 */

/** Hasta dónde llegó. Mismos nombres que el stepper del modal. */
export type OfframpStep = 'funds' | 'create' | 'payout';

/**
 * `abandoned` no es `failed`: nadie vio fallar el retiro, simplemente la fila
 * quedó abierta hasta que dejó de ser creíble que alguien vuelva por ella.
 */
export type OfframpWithdrawalStatus = 'pending' | 'settled' | 'failed' | 'abandoned';

/** Estados en los que el retiro ya terminó y no hay nada que retomar. */
export const TERMINAL_OFFRAMP_STATUSES: OfframpWithdrawalStatus[] = ['settled', 'failed', 'abandoned'];

export interface OfframpWithdrawalRecord {
  id: string;
  walletAddress: string;
  providerTxId?: string | null;
  provider?: string | null;
  country: string;
  rail?: string | null;
  amountFiat: string;
  currency: string;
  usdcAmount?: string | null;
  vaultWithdrawHash?: string | null;
  paymentHash?: string | null;
  step: OfframpStep;
  status: OfframpWithdrawalStatus;
  errorReason?: string | null;
  lastPolledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OfframpWithdrawalRepository {
  create(input: Omit<OfframpWithdrawalRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<OfframpWithdrawalRecord>;
  getById(id: string): Promise<OfframpWithdrawalRecord | null>;
  /** El retiro sin terminar de esa wallet, si hay alguno. */
  findOpenForWallet(walletAddress: string): Promise<OfframpWithdrawalRecord | null>;
  update(id: string, patch: Partial<OfframpWithdrawalRecord>): Promise<OfframpWithdrawalRecord>;
}

export interface StartOfframpWithdrawalInput {
  walletAddress: string;
  country: string;
  amountFiat: string;
  currency: string;
  /** Se conocen por la cotización, antes de crear nada con el proveedor. */
  provider?: string | null;
  rail?: string | null;
  /** Lo que se va a sacar del vault, si ya se calculó. */
  usdcAmount?: string | null;
}

/**
 * Abre la fila ANTES de tocar el vault.
 *
 * El orden es el punto entero del módulo: registrar recién cuando el proveedor
 * devuelve un id —como hace el on-ramp— dejaría sin rastro justamente los
 * retiros que fallan entre el vault y la rampa, que son los que dejan plata
 * colgada.
 */
export async function startOfframpWithdrawal(
  repository: OfframpWithdrawalRepository,
  input: StartOfframpWithdrawalInput,
): Promise<OfframpWithdrawalRecord> {
  return repository.create({
    walletAddress: input.walletAddress,
    country: input.country,
    amountFiat: input.amountFiat,
    currency: input.currency,
    provider: input.provider ?? null,
    rail: input.rail ?? null,
    usdcAmount: input.usdcAmount ?? null,
    providerTxId: null,
    vaultWithdrawHash: null,
    paymentHash: null,
    step: 'funds',
    status: 'pending',
    errorReason: null,
    lastPolledAt: null,
  });
}

/** Lo que un paso puede agregar a la fila. Nada de esto reescribe el desenlace. */
export interface AdvanceOfframpWithdrawalInput {
  /** Siempre la de la sesión: nadie puede tocar el retiro de otro. */
  walletAddress: string;
  id: string;
  step?: OfframpStep;
  providerTxId?: string | null;
  provider?: string | null;
  rail?: string | null;
  usdcAmount?: string | null;
  vaultWithdrawHash?: string | null;
  paymentHash?: string | null;
}

/**
 * Anota el avance de un retiro todavía abierto.
 *
 * Un retiro ya cerrado no se toca: el poller y el usuario volviendo a la
 * pantalla pueden llegar los dos, y el que llega tarde no puede reabrir algo
 * que ya terminó. Devuelve null si no existe o es de otra wallet — para quien
 * llama son lo mismo, no hay nada que pueda tocar.
 */
export async function advanceOfframpWithdrawal(
  repository: OfframpWithdrawalRepository,
  input: AdvanceOfframpWithdrawalInput,
): Promise<OfframpWithdrawalRecord | null> {
  const current = await repository.getById(input.id);
  if (!current || current.walletAddress !== input.walletAddress) return null;
  if (TERMINAL_OFFRAMP_STATUSES.includes(current.status)) return current;

  // Sólo viaja lo que vino definido: un paso que no conoce el hash del pago no
  // puede borrar el que anotó el anterior.
  const patch: Partial<OfframpWithdrawalRecord> = {};
  if (input.step !== undefined) patch.step = input.step;
  if (input.providerTxId !== undefined) patch.providerTxId = input.providerTxId;
  if (input.provider !== undefined) patch.provider = input.provider;
  if (input.rail !== undefined) patch.rail = input.rail;
  if (input.usdcAmount !== undefined) patch.usdcAmount = input.usdcAmount;
  if (input.vaultWithdrawHash !== undefined) patch.vaultWithdrawHash = input.vaultWithdrawHash;
  if (input.paymentHash !== undefined) patch.paymentHash = input.paymentHash;
  if (!Object.keys(patch).length) return current;

  return repository.update(input.id, patch);
}

export interface MarkOfframpWithdrawalTerminalInput {
  walletAddress: string;
  id: string;
  status: Extract<OfframpWithdrawalStatus, 'settled' | 'failed' | 'abandoned'>;
  errorReason?: string | null;
}

/**
 * Cierra un retiro. Idempotente: el primer desenlace es el que vale, así que un
 * fallo que llega tarde no puede convertir en fallido un retiro ya acreditado.
 */
export async function markOfframpWithdrawalTerminal(
  repository: OfframpWithdrawalRepository,
  input: MarkOfframpWithdrawalTerminalInput,
): Promise<OfframpWithdrawalRecord | null> {
  const current = await repository.getById(input.id);
  if (!current || current.walletAddress !== input.walletAddress) return null;
  if (TERMINAL_OFFRAMP_STATUSES.includes(current.status)) return current;

  return repository.update(input.id, {
    status: input.status,
    errorReason: input.errorReason ?? null,
  });
}

/**
 * Cuánto se sigue considerando "en curso" un retiro que nadie cerró.
 *
 * Un retiro no vence del lado del proveedor, así que sin esto la fila se queda
 * en `pending` para siempre y le tapa la pantalla al retiro siguiente. Un día
 * entero es largo a propósito: el KYC del proveedor puede tardar horas y el
 * usuario que vuelve al rato tiene que encontrar su retiro donde lo dejó.
 */
export const OFFRAMP_ABANDON_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * El retiro que esa wallet dejó a medias, para volver a mostrarlo.
 *
 * Leer es el único momento en que alguien mira estas filas, así que es acá
 * donde se cierra la que ya nadie va a retomar. Se cierra como `abandoned` y no
 * se borra: que el retiro haya quedado colgado es justamente el dato que
 * interesa conservar.
 */
export async function findOpenOfframpWithdrawal(
  repository: OfframpWithdrawalRepository,
  walletAddress: string,
  now: Date = new Date(),
): Promise<OfframpWithdrawalRecord | null> {
  const withdrawal = await repository.findOpenForWallet(walletAddress);
  if (!withdrawal) return null;

  if (now.getTime() - withdrawal.updatedAt.getTime() <= OFFRAMP_ABANDON_GRACE_MS) return withdrawal;

  try {
    await markOfframpWithdrawalTerminal(repository, { walletAddress, id: withdrawal.id, status: 'abandoned' });
    return null;
  } catch {
    // No poder cerrarlo no puede romper la lectura: sigue abierto, así que se
    // devuelve como lo que es y se reintenta en la próxima.
    return withdrawal;
  }
}

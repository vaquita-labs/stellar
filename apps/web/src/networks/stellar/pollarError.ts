/**
 * Helpers para recuperar el MOTIVO real de un error de transacción de Pollar, y
 * para no dar por buena una transacción que todavía no llegó al ledger.
 *
 * `signAndSubmitTx` / `buildAndSignAndSubmitTx` devuelven `{ status: 'error' }`
 * SIN `details` cuando la wallet externa tira algo que no es un `Error` (caso
 * típico: al CANCELAR la firma, la stellar-wallets-kit tira un objeto y Pollar
 * descarta el `message`). Ahí el motivo se pierde del outcome, pero la FASE del
 * último estado de error sí lo delata: un fallo en `signing` es el usuario
 * rechazando/cancelando el prompt de la wallet; más adelante (`submitting`) es
 * red o contrato. Por eso escuchamos `onTransactionStateChange` para capturar la
 * fase y armar un texto que `humanizeTxError` sabe mapear a un mensaje amable.
 */

/** Motivo mínimo de un estado/outcome de error de Pollar (lo que necesitamos). */
export type PollarErrorInfo = { phase?: string; details?: string; message?: string; code?: string };

/** On-chain verdict for a submitted hash, as `GET /tx/status` reports it. */
export type PollarTxStatus = {
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  resultCode?: string;
  message?: string;
};

/**
 * The slice of `PollarClient` these helpers use. Structural on purpose: it keeps
 * the settlement logic testable with a plain object and free of the SDK types.
 */
export type SettleClient = {
  onTransactionStateChange: (cb: (s: unknown) => void) => () => void;
  getTxStatus: (hash: string) => Promise<PollarTxStatus>;
};

/**
 * A transaction Horizon acked but that has not reached the ledger within the
 * window we are willing to wait for it.
 *
 * It is NOT a failure: the transaction may still confirm, so a caller must
 * neither treat it as success (the funds may not have moved) nor invite a plain
 * retry (the first one may still land, and the user would pay twice). `hash` is
 * carried so the UI can point at the explorer instead.
 */
export class TxPendingError extends Error {
  readonly hash: string;

  constructor(hash: string) {
    super(`Transaction ${hash} is still confirming`);
    this.name = 'TxPendingError';
    this.hash = hash;
  }
}

/** True when `error` is a still-confirming transaction rather than a failed one. */
export const isTxPendingError = (error: unknown): error is TxPendingError => error instanceof TxPendingError;

/**
 * How long we keep asking the chain after Pollar gave up. The SDK already polls
 * `GET /tx/status` for ~40s inside its own submit call and returns `pending` when
 * that elapses; these polls extend the wait rather than replace it. Stellar closes
 * a ledger every ~5s, so a transaction still unconfirmed after both windows is
 * either never going to be included or the RPC is too far behind to tell us.
 */
const SETTLE_POLL_INTERVAL_MS = 3_000;
const SETTLE_MAX_POLLS = 20;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deriva el mejor mensaje de error de un outcome de Pollar, cayendo a la fase del
 * último estado de error cuando el outcome no trae `details`/`message`.
 */
export const describeOutcomeError = (
  outcome: PollarErrorInfo,
  lastError: PollarErrorInfo | null,
  fallback: string,
): string => {
  const explicit = outcome.details || outcome.message || lastError?.details || lastError?.message;
  if (explicit) return explicit;
  const phase = outcome.phase || lastError?.phase;
  // Falló en la firma sin motivo → el usuario canceló/rechazó en la wallet.
  if (phase === 'signing' || phase === 'building-signing-submitting') {
    return 'User declined the signature request in the wallet';
  }
  return fallback;
};

/**
 * Corre `fn` (un signAndSubmitTx / buildAndSignAndSubmitTx) mientras escucha el
 * estado de la tx para capturar el último error con su fase. Devuelve el outcome
 * y el estado capturado, para que el caller arme el mensaje con
 * `describeOutcomeError`.
 *
 * `onBroadcast` corre en cuanto la transacción tiene hash (ya se firmó y salió a
 * la red), que es antes de que `fn` resuelva: la confirmación todavía se está
 * esperando. Sirve para soltar locks que solo deben cubrir la fase de firma.
 */
export const runWithErrorCapture = async <T extends PollarErrorInfo & { status: string; hash?: string }>(
  client: Pick<SettleClient, 'onTransactionStateChange'>,
  fn: () => Promise<T>,
  onBroadcast?: (hash: string) => void,
): Promise<{ outcome: T; lastError: PollarErrorInfo | null }> => {
  let lastError: PollarErrorInfo | null = null;
  let broadcast = false;
  const unsubscribe = client.onTransactionStateChange((s) => {
    const state = s as { step?: string; hash?: string } & PollarErrorInfo;
    if (state.step === 'error') {
      lastError = { phase: state.phase, details: state.details, message: state.message, code: state.code };
      return;
    }
    if (!broadcast && state.hash && (state.step === 'submitted' || state.step === 'success')) {
      broadcast = true;
      onBroadcast?.(state.hash);
    }
  });
  try {
    const outcome = await fn();
    return { outcome, lastError };
  } finally {
    unsubscribe();
  }
};

/**
 * Sigue preguntando por el hash hasta que la cadena da un veredicto. Vuelve
 * normalmente si confirmó, tira el motivo si falló, y tira `TxPendingError` si se
 * agotó la ventana sin respuesta. Un `getTxStatus` que explota (RPC caído, hipo de
 * red) no cuenta como veredicto: se reintenta, y si nunca hay uno el resultado es
 * `TxPendingError`, nunca un falso éxito.
 */
export const awaitTxSettlement = async (
  client: Pick<SettleClient, 'getTxStatus'>,
  hash: string,
  options: { intervalMs?: number; maxPolls?: number } = {},
): Promise<void> => {
  const intervalMs = options.intervalMs ?? SETTLE_POLL_INTERVAL_MS;
  const maxPolls = options.maxPolls ?? SETTLE_MAX_POLLS;

  for (let i = 0; i < maxPolls; i += 1) {
    // Esperamos primero: el SDK acaba de leer PENDING, preguntar de nuevo en el
    // mismo instante solo gasta un round-trip.
    await sleep(intervalMs);
    let status: PollarTxStatus;
    try {
      status = await client.getTxStatus(hash);
    } catch {
      continue;
    }
    if (status.status === 'SUCCESS') return;
    if (status.status === 'FAILED') {
      throw new Error(status.message || status.resultCode || 'The network rejected the transaction');
    }
  }
  throw new TxPendingError(hash);
};

/**
 * Envía una transacción por Pollar y devuelve su hash SOLO cuando el ledger la
 * confirmó. Es el único camino que deberían usar los flujos con plata: los tres
 * outcomes de Pollar (`success` / `pending` / `error`) se reducen acá a "devolvió
 * hash" o "tiró", así que un paso que sigue a este corre sabiendo que el anterior
 * está en cadena.
 *
 * `error` tira el motivo real (vía `describeOutcomeError`), `pending` sigue
 * esperando el veredicto y termina en `TxPendingError` si nunca llega.
 */
export const submitAndSettle = async <T extends PollarErrorInfo & { status: string; hash?: string }>(
  client: SettleClient,
  fn: () => Promise<T>,
  fallback: string,
  options: { intervalMs?: number; maxPolls?: number; onBroadcast?: (hash: string) => void } = {},
): Promise<{ hash: string }> => {
  const { onBroadcast, ...pollOptions } = options;
  const { outcome, lastError } = await runWithErrorCapture(client, fn, onBroadcast);

  if (outcome.status === 'error') {
    throw new Error(describeOutcomeError(outcome, lastError, fallback));
  }
  // Un outcome no-error sin hash no es algo que el SDK produzca; si pasara, no hay
  // nada que verificar ni que mostrar, así que se trata como fallo.
  if (!outcome.hash) throw new Error(fallback);

  if (outcome.status === 'pending') {
    await awaitTxSettlement(client, outcome.hash, pollOptions);
  }
  return { hash: outcome.hash };
};

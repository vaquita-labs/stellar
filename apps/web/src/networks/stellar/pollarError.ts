/**
 * Helpers para recuperar el MOTIVO real de un error de transacción de Pollar.
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
 */
export const runWithErrorCapture = async <
  T extends PollarErrorInfo & { status: string; hash?: string },
>(
  client: { onTransactionStateChange: (cb: (s: unknown) => void) => () => void },
  fn: () => Promise<T>,
): Promise<{ outcome: T; lastError: PollarErrorInfo | null }> => {
  let lastError: PollarErrorInfo | null = null;
  const unsubscribe = client.onTransactionStateChange((s) => {
    const state = s as { step?: string } & PollarErrorInfo;
    if (state.step === 'error') {
      lastError = { phase: state.phase, details: state.details, message: state.message, code: state.code };
    }
  });
  try {
    const outcome = await fn();
    return { outcome, lastError };
  } finally {
    unsubscribe();
  }
};

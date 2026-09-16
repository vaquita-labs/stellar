import type { RampTxStatus } from '@pollar/core';

/** En qué pantalla está la compra. */
export type OnrampScreen = 'paying' | 'checking' | 'processing' | 'settled' | 'failed' | 'expired';

/**
 * How long after the code runs out the purchase is still looked for before
 * saying "expired, nothing was charged". A bank QR paid in the last seconds
 * reaches the provider after the clock hits zero, and telling that user nothing
 * was charged is how they end up paying twice.
 */
export const EXPIRY_GRACE_MS = 3 * 60_000;

export interface FlowInput {
  /** Lo último que dijo el proveedor, o null si todavía no se le preguntó. */
  providerStatus: RampTxStatus | null;
  expiresAt: Date | null;
  now: Date;
  /**
   * A `completed` that arrived straight from the QR is held on the processing
   * screen for a moment, so the intermediate state is never skipped.
   */
  holdProcessing?: boolean;
}

export function screenFor({ providerStatus, expiresAt, now, holdProcessing }: FlowInput): OnrampScreen {
  if (providerStatus === 'completed') return holdProcessing ? 'processing' : 'settled';
  if (providerStatus === 'failed') return 'failed';
  if (providerStatus === 'processing') return 'processing';
  if (!expiresAt || expiresAt.getTime() > now.getTime()) return 'paying';
  return now.getTime() - expiresAt.getTime() < EXPIRY_GRACE_MS ? 'checking' : 'expired';
}

/** Estados en los que la compra ya terminó, tal como los guarda el servidor. */
export type TerminalOnrampStatus = 'settled' | 'expired' | 'failed';

/**
 * Qué cerrar del lado del servidor por estar en esta pantalla, o null si todavía
 * no hay nada que cerrar. `processing` no es terminal a propósito: el proveedor
 * vio el pago pero no acreditó, y darlo por cerrado dejaría al usuario sin
 * pantalla a la que volver justo mientras su plata está en el aire.
 */
export function terminalStatusFor(screen: OnrampScreen): TerminalOnrampStatus | null {
  return screen === 'settled' || screen === 'failed' || screen === 'expired' ? screen : null;
}

/**
 * ¿Vale la pena seguir preguntándole al proveedor?
 *
 * Mientras la compra puede cambiar sola, sí. Y una vez liquidada también, si
 * todavía no dio el `stellarTxHash`: el proveedor marca `completed` en cuanto
 * firma, a veces un latido antes de publicar el hash, y ese hash es lo único
 * que permite leer del ledger cuánto USDC entró. Dejar de preguntar en el
 * instante en que la pantalla pasa a liquidada es cómo una compra se queda sin
 * cifra para siempre: nada más vuelve a pedirlo.
 */
export function shouldPoll(screen: OnrampScreen, hasSettleHash = false): boolean {
  if (screen === 'paying' || screen === 'checking' || screen === 'processing') return true;
  return screen === 'settled' && !hasSettleHash;
}

/**
 * How much USDC the user received, or null when nobody can say.
 *
 * The provider returns the transaction with `amount`/`currency`, but on a
 * purchase those are the BOLIVIANOS that were paid, not the USDC that landed:
 * only when it reports the figure in USDC can it be taken as what was credited.
 * Otherwise the answer is `credited`, read off the ledger by the caller.
 *
 * null is a result and not an error: with the provider reporting fiat and the
 * ledger unreadable, there is no honest number to show, and the screen says the
 * money arrived without naming one.
 */
export function receivedUsdcFrom(tx: { amount: number; currency: string }, credited: number | null): number | null {
  if (tx.currency?.toUpperCase() === 'USDC' && Number.isFinite(tx.amount)) return tx.amount;
  return credited != null && Number.isFinite(credited) ? credited : null;
}

/** Qué hacer al reabrir el modal sobre una compra que quedó registrada. */
export type ResumeAction = 'restart' | 'resume';

/**
 * Si la compra registrada se retoma en pantalla o se descarta y se vuelve al
 * monto.
 *
 * Se descarta sólo cuando las dos fuentes coinciden: el servidor la da por
 * vencida y el proveedor confirma que nunca vio el pago. Con el estado del
 * proveedor desconocido —la consulta falló— se retoma: cerrar una compra que no
 * se pudo verificar es cómo una compra acreditada pierde su pantalla de éxito.
 */
export function resumeActionFor({
  state,
  providerStatus,
}: {
  state: 'pending' | 'expired';
  providerStatus: RampTxStatus | null;
}): ResumeAction {
  return state === 'expired' && providerStatus === 'pending' ? 'restart' : 'resume';
}

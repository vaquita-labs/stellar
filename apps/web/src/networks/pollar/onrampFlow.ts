import type { RampTxStatus } from '@pollar/core';

/** En qué pantalla está la compra. */
export type OnrampScreen = 'paying' | 'processing' | 'settled' | 'failed' | 'expired';

export interface FlowInput {
  /** Lo último que dijo el proveedor, o null si todavía no se le preguntó. */
  providerStatus: RampTxStatus | null;
  expiresAt: Date | null;
  now: Date;
}

export function screenFor({ providerStatus, expiresAt, now }: FlowInput): OnrampScreen {
  if (providerStatus === 'completed') return 'settled';
  if (providerStatus === 'failed') return 'failed';
  if (providerStatus === 'processing') return 'processing';
  const ranOut = !!expiresAt && expiresAt.getTime() <= now.getTime();
  return ranOut ? 'expired' : 'paying';
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

/** ¿Vale la pena seguir preguntándole al proveedor? */
export function shouldPoll(screen: OnrampScreen): boolean {
  return screen === 'paying' || screen === 'processing';
}

/**
 * Cuánto USDC recibió el usuario, o null si nadie lo sabe.
 *
 * El proveedor devuelve la transacción con `amount`/`currency`, pero en la
 * compra esos son los BOLIVIANOS que se pagaron, no el USDC que llegó: sólo
 * cuando informa el monto en USDC se lo puede tomar como lo acreditado. Si no,
 * queda la estimación de la cotización, que existe sólo en el dispositivo donde
 * se hizo la compra — por eso null es un resultado posible y no un error: al
 * retomar desde otro teléfono no hay número honesto que mostrar.
 */
export function receivedUsdcFrom(tx: { amount: number; currency: string }, estimate: number | null): number | null {
  if (tx.currency?.toUpperCase() === 'USDC' && Number.isFinite(tx.amount)) return tx.amount;
  return estimate != null && Number.isFinite(estimate) ? estimate : null;
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

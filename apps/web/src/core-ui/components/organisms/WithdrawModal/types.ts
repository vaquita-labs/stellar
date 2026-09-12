import type { PendingWithdrawPayment } from '@/networks/stellar/withdrawError';
import { SavedWallet } from '../../../hooks/useSavedWallets';

export type WithdrawStep =
  | 'method'
  | 'amount'
  | 'account'
  | 'username'
  | 'addWallet'
  | 'addNickname'
  | 'confirm'
  | 'processing'
  | 'success'
  /**
   * El retiro movió la plata y el pago no salió: quedó en la wallet del usuario,
   * fuera del ahorro. No es una confirmación con un error encima —no hay nada
   * que volver a firmar— sino el estado en el que quedó y lo que falta hacer.
   */
  | 'partial';

/**
 * Sub-pasos del retiro, para el progreso visible:
 *   - 'preparing' = retirar de Blend → wallet (salto 1 del retiro social).
 *   - 'sending'   = enviar a la wallet destino (salto único externa / salto 2 social).
 */
export type WithdrawProgressStep = 'preparing' | 'sending';

export interface WithdrawSubmitInput {
  amount: number;
  /** El usuario pidió retirar TODO: el submit usa el sentinel i128 de Blend. */
  withdrawAll: boolean;
  /** Destino: la wallet propia (login externo) o la externa elegida (social). */
  wallet: SavedWallet;
  /** El submit lo llama al arrancar cada salto para animar el progreso. */
  onProgress: (step: WithdrawProgressStep) => void;
}

export interface WithdrawModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Retiro a cuenta bancaria: cierra este modal y abre el flujo de off-ramp fiat. */
  onOfframp: () => void;
  /**
   * The payment leg failed with the money already out of savings and sitting in
   * the wallet. Closes this modal and opens Send with the transfer seeded, which
   * is the only way out that does not withdraw a second time.
   */
  onResumePayment: (payment: PendingWithdrawPayment) => void;
  /**
   * Ejecuta el retiro. Debe resolver cuando la operación terminó (el modal pasa
   * a "success") o tirar con un error legible (vuelve a la confirmación).
   */
  onSubmit: (input: WithdrawSubmitInput) => Promise<void>;
}

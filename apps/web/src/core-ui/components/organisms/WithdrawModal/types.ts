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
  | 'success';

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
   * Ejecuta el retiro. Debe resolver cuando la operación terminó (el modal pasa
   * a "success") o tirar con un error legible (vuelve a la confirmación).
   */
  onSubmit: (input: WithdrawSubmitInput) => Promise<void>;
}

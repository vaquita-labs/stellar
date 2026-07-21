import { SavedWallet } from '../../../hooks/useSavedWallets';

export type WithdrawStep =
  | 'method'
  | 'amount'
  | 'account'
  | 'addWallet'
  | 'confirm'
  | 'processing'
  | 'success';

export interface WithdrawSubmitInput {
  amount: number;
  wallet: SavedWallet;
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

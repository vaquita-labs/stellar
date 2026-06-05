import { DepositResponseDTO, DepositSummaryResponseDTO } from '../../../types';

export interface VaquitaModalContentProps {
  isOpen: boolean;
  onClose: () => void;
  vaquita: DepositResponseDTO;
  isLeaderboard?: boolean | false;
  /**
   * Modo tutorial: misma UI, pero el lock/interés se derivan en vivo del
   * `vaquita` simulado y al confirmar NO se toca la blockchain.
   */
  simulate?: boolean;
  /** Interés total a mostrar/entregar en modo simulado. */
  simulateInterest?: number;
  /** Llamado tras un retiro simulado exitoso. */
  onSimulatedWithdraw?: () => void;
}

export interface VaquitaModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaquitaSummary: DepositSummaryResponseDTO;
  isLeaderboard?: boolean | false;
}

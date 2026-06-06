import { DepositResponseDTO } from '../../../types';

export type BankAPYModalProps = {
  open: boolean;
  onOpenChange: () => void;
  /**
   * Modo tutorial: depósitos a mostrar en vez de los reales (que vienen del
   * hook). Permite enseñar el modal con un depósito simulado.
   */
  injectedDeposits?: DepositResponseDTO[];
  /**
   * Modo tutorial: el detalle se pinta inline (igual que en modo real), pero el
   * lock/interés se derivan del depósito simulado y al confirmar NO se toca la
   * blockchain.
   */
  simulate?: boolean;
  /** Interés total a mostrar/entregar en el detalle simulado. */
  simulateInterest?: number;
  /** Llamado tras un retiro simulado exitoso. */
  onSimulatedWithdraw?: () => void;
  /**
   * Notifica al orquestador (tutorial) cuando se entra/sale del detalle inline,
   * para coordinar el anillo guía y el avance de pasos.
   */
  onDetailOpenChange?: (inDetail: boolean) => void;
};

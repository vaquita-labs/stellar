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
   * Modo tutorial: al tocar una vaquita de la lista, en vez de abrir el modal de
   * retiro interno (que refetchea on-chain), delega al orquestador del tutorial.
   */
  onVaquitaSelect?: (deposit: DepositResponseDTO) => void;
};

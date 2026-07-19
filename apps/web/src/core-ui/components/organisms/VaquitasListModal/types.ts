export type VaquitasListModalProps = {
  open: boolean;
  onOpenChange: () => void;
  /** Modo retiro: lista solo los depósitos activos listos para retirar (sin tabs ni filtros). */
  readyToWithdrawOnly?: boolean;
};

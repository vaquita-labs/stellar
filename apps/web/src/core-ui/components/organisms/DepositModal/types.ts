import { Dispatch, SetStateAction } from 'react';

export type DepositModalProps = {
  open: boolean;
  onOpenChange: () => void;
  isDepositing: boolean;
  setIsDepositing: Dispatch<SetStateAction<boolean>>;
  /**
   * Modo tutorial: muestra el modal REAL (misma UI) pero al confirmar NO toca la
   * blockchain. Simula el éxito y avisa por `onSimulatedSuccess`.
   */
  simulate?: boolean;
  /** Monto con el que precargar el input (ej. el monto de ejemplo del tutorial). */
  initialAmount?: string;
  /** En `simulate`, único lock disponible (ms). Por defecto 5000 (5 segundos). */
  simulateLockMs?: number;
  /** Llamado tras un depósito simulado exitoso (solo cuando `simulate`). */
  onSimulatedSuccess?: (amount: number, lockPeriod: number) => void;
};

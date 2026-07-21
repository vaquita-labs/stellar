/**
 * Una fila de "Allocation": un lock period del token con lo que el usuario
 * tiene puesto ahí y el APY que paga ese plazo. Los plazos vienen de
 * `token.lockPeriods` (ms) y el monto de agrupar los depósitos activos.
 */
export interface Allocation {
  /** Lock period en milisegundos; es la identidad de la fila. */
  lockPeriod: number;
  /** Etiqueta ya traducida del plazo (ej. "7 días"). */
  label: string;
  /** Capital del usuario en este plazo. */
  amount: number;
  /** APY total del plazo (pool de Vaquita + protocolo de lending). */
  apy: number;
  vaquitaApy: number;
  protocolApy: number;
  lendingMarketName?: string;
}

export interface PortfolioPanelProps {
  open: boolean;
  onOpenChange: () => void;
  /** Ganancia estimada del pool de Vaquita, sumada por quien abre el panel. */
  vaquitaEarnings: number;
  /** Ganancia estimada del protocolo de lending. */
  protocolEarnings: number;
  /** APY del protocolo para el plazo seleccionado (chip del desglose). */
  protocolApy: number;
  lendingMarketName?: string;
  tokenSymbol?: string;
}

export type MoveFundsStep = 'amount' | 'confirm' | 'processing' | 'success';

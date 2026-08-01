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
  /** Premios del pool de este plazo (USDC), lo cierto que sí mostramos. */
  rewardPool: number;
  /** Posiciones abiertas en este plazo (prueba social, no un rate). */
  openPositions: number;
  /** TVL del pool de este plazo: total depositado on-chain (USDC). */
  totalDeposits: number;
}

export interface PortfolioPanelProps {
  open: boolean;
  onOpenChange: () => void;
  tokenSymbol?: string;
}

export type MoveFundsStep = 'amount' | 'confirm' | 'processing' | 'success';

export type EarningsModalProps = {
  open: boolean;
  onOpenChange: () => void;
  /** Ganancia estimada proveniente del pool comunitario de Vaquita. */
  vaquitaEarnings: number;
  /** Ganancia estimada proveniente del protocolo de lending (ej. Blend). */
  protocolEarnings: number;
  /** APY del protocolo de lending, para el chip junto a su fila. */
  protocolApy: number;
  /** Nombre del mercado de lending; si falta se usa un genérico. */
  lendingMarketName?: string;
  tokenSymbol?: string;
};

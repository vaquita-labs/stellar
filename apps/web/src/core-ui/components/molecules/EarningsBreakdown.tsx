'use client';

import { useTranslation } from 'react-i18next';

export interface EarningsBreakdownProps {
  /** Ganancia estimada proveniente del pool comunitario de Vaquita. */
  vaquitaEarnings: number;
  /** Ganancia estimada proveniente del protocolo de lending (ej. Blend). */
  protocolEarnings: number;
  /** APY del protocolo de lending, para el chip junto a su fila. */
  protocolApy: number;
  /** Nombre del mercado de lending; si falta se usa un genérico. */
  lendingMarketName?: string;
  tokenSymbol?: string;
}

/**
 * Desglose de la ganancia estimada: el total y de dónde sale cada parte (pool
 * de Vaquita vs. protocolo de lending). Los montos los calcula quien lo
 * renderiza, porque cada depósito estima según el APY de su propio lock period.
 */
export function EarningsBreakdown({
  vaquitaEarnings,
  protocolEarnings,
  protocolApy,
  lendingMarketName,
  tokenSymbol = 'USDC',
}: EarningsBreakdownProps) {
  const { t } = useTranslation();
  const market = lendingMarketName || t('deposit.bank.theLendingProtocol', 'the lending protocol');
  const total = vaquitaEarnings + protocolEarnings;

  return (
    <div className="rounded-xl border border-black border-b-2 overflow-hidden">
      <div className="bg-success/15 px-4 py-3">
        <p className="text-xs text-success/80 font-semibold uppercase tracking-wide">
          {t('deposit.bank.estimatedEarningsTotal', 'Estimated earnings total')}
        </p>
        <p className="text-3xl font-bold text-success leading-tight">
          {total.toFixed(2)}
          <span className="text-base ml-1 font-semibold">{tokenSymbol}</span>
        </p>
      </div>

      <div className="divide-y divide-black/10 bg-white">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
              <span className="text-sm font-bold text-black">
                {t('deposit.bank.vaquitaRewards', 'Vaquita rewards')}
              </span>
            </div>
            <span className="text-sm font-bold text-black tabular-nums shrink-0">
              +{vaquitaEarnings.toFixed(2)} {tokenSymbol}
            </span>
          </div>
          <p className="text-xs text-gray-600 ml-[18px] mt-0.5">
            {t('deposit.bank.vaquitaRewardsInfo', 'Rewards from the Vaquita community pool, based on your lock period.')}
          </p>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-success shrink-0" />
              <span className="text-sm font-bold text-black truncate">
                {t('deposit.bank.marketRewards', '{{market}} rewards', { market })}
              </span>
              <span className="shrink-0 rounded-md bg-success/15 px-1.5 py-0.5 text-[11px] font-bold text-success tabular-nums">
                {protocolApy.toFixed(2)}% APY
              </span>
            </div>
            <span className="text-sm font-bold text-black tabular-nums shrink-0">
              +{protocolEarnings.toFixed(2)} {tokenSymbol}
            </span>
          </div>
          <p className="text-xs text-gray-600 ml-[18px] mt-0.5">
            {t('deposit.bank.protocolRewardsInfo', 'Yield from {{market}} where your funds are deposited.', { market })}
          </p>
        </div>
      </div>
    </div>
  );
}

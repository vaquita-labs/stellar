'use client';

import { formatUsd } from '@/core-ui/helpers/numbers';
import { useTranslation } from 'react-i18next';

/**
 * Las dos cifras CIERTAS de un pool de plazo, apiladas en dos líneas: el pozo de
 * premios del plazo (USDC, 2 decimales) arriba y cuánto capital hay depositado en
 * el pool (el TVL del plazo, mismo formato) abajo.
 * Las dos son del PLAZO, no del usuario: el pozo se reparte a prorrata del capital
 * (`estimateRewardShare`), por eso la etiqueta dice "pozo" y nunca "tus premios".
 * Reemplaza el "% APY" engañoso en todas las tarjetas de plazo (fila del
 * portfolio, selector/lista de invertir, mover fondos). Una sola línea se cortaba
 * feo en pantallas angostas; por eso van apiladas.
 */
export function PoolMeta({
  rewardPool,
  totalDeposits,
  className = '',
}: {
  rewardPool: number;
  totalDeposits: number;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={`block leading-tight tabular-nums ${className}`}>
      <span className="block">
        {t('portfolio.poolRewards', '{{amount}} reward pool', { amount: formatUsd(rewardPool) })}
      </span>
      <span className="block">
        {t('portfolio.inThePool', '{{value}} in the pool', { value: formatUsd(totalDeposits) })}
      </span>
    </span>
  );
}

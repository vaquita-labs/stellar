'use client';

import { formatUsd } from '@/core-ui/helpers/numbers';
import { useTranslation } from 'react-i18next';

/**
 * Las dos cifras CIERTAS de un pool de plazo, apiladas en dos líneas: los premios
 * del pool (USDC, 2 decimales) arriba y cuántos depósitos abiertos tiene abajo.
 * Reemplaza el "% APY" engañoso en todas las tarjetas de plazo (fila del
 * portfolio, selector/lista de invertir, mover fondos). Una sola línea se cortaba
 * feo en pantallas angostas; por eso van apiladas.
 */
export function PoolMeta({
  rewardPool,
  openPositions,
  className = '',
}: {
  rewardPool: number;
  openPositions: number;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={`block leading-tight tabular-nums ${className}`}>
      <span className="block">
        {t('portfolio.poolRewards', '{{amount}} in rewards', { amount: formatUsd(rewardPool) })}
      </span>
      <span className="block">
        {t('portfolio.depositCount', '{{count}} deposits', { count: openPositions })}
      </span>
    </span>
  );
}

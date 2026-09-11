'use client';

import { formatUsd } from '@/core-ui/helpers/numbers';
import { useTranslation } from 'react-i18next';

/**
 * La línea de un plazo: la tasa del vault + el pozo de premios de ese plazo.
 *
 * Las dos cifras son CIERTAS y las dos son del PLAZO, no del usuario. La tasa es
 * la del vault de DeFindex (`protocolApy`), que es donde el pool mete los fondos
 * lockeados, así que describe igual de bien al plazo que al saldo flexible. El
 * pozo se reparte a prorrata del capital (`estimateRewardShare`), por eso dice
 * "premios" y nunca "tus premios".
 *
 * Sin tasa (`apy <= 0`) queda solo el pozo: `getVaultApy` devuelve 0 cuando
 * DeFindex falla y no hay snapshot, y pintar "0.00% APY" sería afirmar una tasa
 * que nadie leyó. El TVL del plazo que antes iba abajo se sacó: competía visual-
 * mente con el pozo y nadie lo pidió.
 */
export function PoolMeta({ rewardPool, apy, className = '' }: { rewardPool: number; apy: number; className?: string }) {
  const { t } = useTranslation();
  const amount = formatUsd(rewardPool);
  return (
    <span className={`block leading-tight tabular-nums ${className}`}>
      {apy > 0
        ? t('portfolio.poolRewardsApy', '{{apy}}% APY + {{amount}} in rewards', { apy: apy.toFixed(2), amount })
        : t('portfolio.poolRewards', '{{amount}} in rewards', { amount })}
    </span>
  );
}

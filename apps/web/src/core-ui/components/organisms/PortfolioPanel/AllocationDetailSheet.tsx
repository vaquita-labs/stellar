'use client';

import { formatUsd, formatUsdAdaptive } from '@/core-ui/helpers/numbers';
import { estimateRewardShare } from '@/core-ui/helpers/rewards';
import { formatTimeDeposit } from '@/core-ui/helpers/time';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';
import { AllocationStyle } from './allocationStyles';
import { Allocation } from './types';

interface AllocationDetailSheetProps {
  open: boolean;
  onOpenChange: () => void;
  allocation: Allocation;
  style: AllocationStyle;
  tokenSymbol?: string;
  /** Qué porción de TODO tu portafolio está en este plazo (para el subtítulo). */
  portfolioPct: number;
  /** Abre la lista de posiciones de este plazo para retirar. */
  onWithdraw: () => void;
}

/**
 * Detalle de un plazo: cuánto tenés ahí, cuánto rinde y por qué. El CTA lleva a
 * retirar (abre la lista de posiciones de este plazo).
 */
export function AllocationDetailSheet({
  open,
  onOpenChange,
  allocation,
  style,
  tokenSymbol = 'USDC',
  portfolioPct,
  onWithdraw,
}: AllocationDetailSheetProps) {
  const { t } = useTranslation();

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={allocation.label}
      size="md"
      // Se abre apilado sobre el panel de Portfolio: el botón vuelve al panel
      // (flecha atrás a la izquierda), no cierra todo con una X.
      onBack={onOpenChange}
      backVariant="primary"
      hideClose
      bodyClassName="flex flex-col gap-4 pb-2 overflow-x-hidden"
      footer={
        <PressableButton
          variant="white"
          size="cta"
          className="py-2.5!"
          onClick={onWithdraw}
          disabled={allocation.amount <= 0}
        >
          {t('deposit.withdraw.button', 'Withdraw')}
        </PressableButton>
      }
    >
      <div className="flex min-w-0 items-center gap-3">
        <p className="min-w-0 truncate text-4xl font-bold text-black tabular-nums">{formatUsdAdaptive(allocation.amount)}</p>
        <span className={`w-10 h-10 rounded-full shrink-0 ${style.solid}`} />
      </div>
      <p className="-mt-3 text-sm text-black tabular-nums">
        {t('portfolio.detail.portfolioShare', '{{pct}}% of your portfolio', { pct: portfolioPct.toFixed(1) })}
      </p>

      <div>
        <p className="text-xs text-gray-500 mb-1">{t('portfolio.detail.description', 'Description')}</p>
        <p className="text-sm text-black leading-relaxed">
          {t(
            'portfolio.detail.descriptionText',
            'Funds saved for {{period}} earn a bigger share of the Vaquita reward pool. The longer the term, the higher the APY.',
            { period: allocation.label },
          )}
        </p>
      </div>

      <div className="divide-y divide-black/10">
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="text-gray-500">{t('portfolio.detail.withdrawPeriod', 'Withdraw period')}</span>
          <span className="font-bold text-black">{formatTimeDeposit(allocation.lockPeriod)}</span>
        </div>
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="text-gray-500">{t('portfolio.detail.rewardsPool', 'Pool rewards')}</span>
          <span className="font-bold text-black tabular-nums">{formatUsd(allocation.rewardPool)}</span>
        </div>
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="text-gray-500">{t('portfolio.detail.tvl', 'TVL')}</span>
          <span className="font-bold text-black tabular-nums">{formatUsd(allocation.totalDeposits)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="text-gray-500 truncate">{t('portfolio.detail.depositors', 'Open deposits')}</span>
          <span className="font-bold text-black tabular-nums shrink-0">{allocation.openPositions}</span>
        </div>
        {/* Pozo y TVL son del PLAZO; esta fila es la única que habla de vos. Sin ella
            el pozo entero se leía como propio (con $4 de pozo y $183 de TVL, $32
            depositados cobran $0.70). `allocation.amount` ya está dentro del TVL, así
            que el denominador va tal cual. */}
        <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="text-gray-500 truncate">
            {t('portfolio.detail.yourShareEstimate', 'Your estimated share')}
          </span>
          <span className="font-bold text-success tabular-nums shrink-0">
            {formatUsd(estimateRewardShare(allocation.rewardPool, allocation.totalDeposits, allocation.amount))}
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {t(
          'portfolio.detail.estimateNote',
          'Rewards are shared among everyone in this pool and can change as people join or leave.',
        )}
      </p>
    </AppModal>
  );
}

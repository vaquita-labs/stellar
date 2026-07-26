'use client';

import { formatUsd } from '@/core-ui/helpers/numbers';
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
  onWithdraw,
}: AllocationDetailSheetProps) {
  const { t } = useTranslation();
  const market = allocation.lendingMarketName || t('deposit.bank.theLendingProtocol', 'the lending protocol');

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={allocation.label}
      size="md"
      bodyClassName="flex flex-col gap-4 pb-2"
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
      <div className="flex items-center gap-3">
        <p className="text-4xl font-bold text-black tabular-nums">{formatUsd(allocation.amount)}</p>
        <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${style.chip}`}>
          {style.icon}
        </span>
      </div>
      <p className="-mt-3 text-sm font-bold text-success tabular-nums">{allocation.apy.toFixed(2)}% APR</p>

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
          <span className="text-gray-500">{t('portfolio.detail.vaquitaApy', 'Vaquita pool APY')}</span>
          <span className="font-bold text-black tabular-nums">{allocation.vaquitaApy.toFixed(2)}%</span>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="text-gray-500 truncate">{t('portfolio.detail.marketApy', '{{market}} APY', { market })}</span>
          <span className="font-bold text-black tabular-nums shrink-0">{allocation.protocolApy.toFixed(2)}%</span>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {t('portfolio.detail.estimateNote', 'APR is an estimate and may change over time.')}
      </p>
    </AppModal>
  );
}

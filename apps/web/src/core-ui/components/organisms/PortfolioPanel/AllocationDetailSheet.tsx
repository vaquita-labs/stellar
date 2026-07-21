'use client';

import { formatUsd } from '@/core-ui/helpers/numbers';
import { formatTimeDeposit } from '@/core-ui/helpers/time';
import { Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../../molecules/AppModal';
import { AllocationStyle } from './allocationStyles';
import { Allocation } from './types';

interface AllocationDetailSheetProps {
  open: boolean;
  onOpenChange: () => void;
  allocation: Allocation;
  style: AllocationStyle;
  tokenSymbol?: string;
  /** Abre "Move funds" con este plazo como destino. */
  onManage: () => void;
  canManage: boolean;
}

/**
 * Detalle de un plazo: cuánto tenés ahí, cuánto rinde y por qué. El CTA lleva a
 * mover fondos hacia este mismo plazo, que es la acción natural desde acá.
 */
export function AllocationDetailSheet({
  open,
  onOpenChange,
  allocation,
  style,
  tokenSymbol = 'USDC',
  onManage,
  canManage,
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
        canManage ? (
          <Button
            onPress={onManage}
            className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md text-black"
          >
            {t('portfolio.manage', 'Manage allocations')}
          </Button>
        ) : undefined
      }
    >
      <div className="flex items-center gap-3">
        <p className="text-4xl font-bold text-black tabular-nums">{formatUsd(allocation.amount)}</p>
        <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${style.chip}`}>
          {style.icon}
        </span>
      </div>
      <p className="-mt-3 text-sm font-bold text-success tabular-nums">{allocation.apy.toFixed(2)}% APY</p>

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

      <div className="divide-y divide-black/10 border-y border-black/10">
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

      <p className="text-xs text-gray-500 leading-relaxed">
        {t(
          'deposit.bank.estimatesDisclaimer',
          'These are estimates and update over time final rewards are confirmed when you withdraw.',
        )}{' '}
        {t('portfolio.detail.tokenNote', 'Balances are shown in {{token}}.', { token: tokenSymbol })}
      </p>
    </AppModal>
  );
}

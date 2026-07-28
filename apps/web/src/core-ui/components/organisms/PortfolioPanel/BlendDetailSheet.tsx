'use client';

import { formatUsdAdaptive } from '@/core-ui/helpers/numbers';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../../molecules/AppModal';

interface BlendDetailSheetProps {
  open: boolean;
  onOpenChange: () => void;
  amount: number;
  apy: number;
  tokenSymbol?: string;
}

/**
 * Detalle de Blend (nivel base, flexible). Explica qué es y cómo funciona: rinde
 * en Blend sin lock, se retira cuando querés. Es el equivalente al
 * `AllocationDetailSheet` de los plazos, pero para el tramo líquido.
 */
export function BlendDetailSheet({
  open,
  onOpenChange,
  amount,
  apy,
  tokenSymbol = 'USDC',
}: BlendDetailSheetProps) {
  const { t } = useTranslation();

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('portfolio.blend.label', 'Blend · Flexible')}
      size="md"
      // Apilado sobre el panel de Portfolio (igual que AllocationDetailSheet):
      // el botón vuelve al panel, no cierra todo con una X.
      onBack={onOpenChange}
      backVariant="primary"
      hideClose
      bodyClassName="flex flex-col gap-4 pb-2 overflow-x-hidden"
    >
      <div className="flex min-w-0 items-center gap-3">
        <p className="min-w-0 truncate text-4xl font-bold text-black tabular-nums">{formatUsdAdaptive(amount)}</p>
        <span className="w-10 h-10 rounded-full shrink-0 bg-primary" />
      </div>
      <p className="-mt-3 text-sm font-bold text-success tabular-nums">{apy.toFixed(2)}% APY</p>

      <div>
        <p className="text-xs text-gray-500 mb-1">{t('portfolio.detail.description', 'Description')}</p>
        <p className="text-sm text-black leading-relaxed">
          {t(
            'portfolio.blend.detailText',
            'Your USDC earns yield in Blend, a lending protocol on Stellar. There is no lock period, so you can withdraw your money whenever you want.',
          )}
        </p>
      </div>

      <div className="divide-y divide-black/10">
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="text-gray-500">{t('portfolio.detail.withdrawPeriod', 'Withdraw period')}</span>
          <span className="font-bold text-black">{t('portfolio.blend.anytime', 'Anytime')}</span>
        </div>
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="text-gray-500">{t('portfolio.blend.yieldSource', 'Yield source')}</span>
          <span className="font-bold text-black">Blend</span>
        </div>
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="text-gray-500">{t('portfolio.detail.marketApy', '{{market}} APY', { market: 'Blend' })}</span>
          <span className="font-bold text-black tabular-nums">{apy.toFixed(2)}%</span>
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

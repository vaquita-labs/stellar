'use client';

import { DepositEarnings, DepositEarningsReporter } from '@/core-ui/components/home/DepositEarningsReporter';
import { DepositListTab, DepositListTabs } from '@/core-ui/components/home/DepositListTabs';
import { VaquitaDepositCard } from '@/core-ui/components/home/VaquitaDepositCard';
import { WithdrawnDepositCard } from '@/core-ui/components/home/WithdrawnDepositCard';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApyByLockPeriod, useDeposit, useDepositsComplete } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DepositResponseDTO } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { useVaquitaDetail } from '../VaquitaModal';
import { BankAPYModalProps } from './types';

export function BankAPYModal({
  open,
  onOpenChange,
  injectedDeposits,
  simulate = false,
  simulateInterest = 0,
  onSimulatedWithdraw,
  onDetailOpenChange,
  onConfirmingChange,
  lockToWithdraw = false,
}: BankAPYModalProps) {
  const { t } = useTranslation();
  const { network, lockPeriod, walletAddress, token } = useConfigStore();
  const { data: depositsData, isLoading: isLoadingDeposits } = useDepositsComplete(walletAddress);
  // APY real por fuente y nombre del mercado de lending (ej. Defindex).
  const { data: dataApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');
  const lendingMarketName = dataApy?.lendingMarketName ?? '';
  const vaquitaApy = dataApy?.vaquitaApy ?? 0;
  const protocolApy = dataApy?.protocolApy ?? 0;

  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showEarningsInfo, setShowEarningsInfo] = useState(false);
  const [selectedVaquita, setSelectedVaquita] = useState<DepositResponseDTO | null>(null);
  const [tab, setTab] = useState<DepositListTab>('active');

  // En modo tutorial mostramos un depósito inyectado en vez de los reales.
  const sourceDeposits = injectedDeposits ?? depositsData?.deposits ?? [];

  const { deposits, activeDeposits, withdrawnDeposits, activeDepositsTotalAmount } = getDepositsData(sourceDeposits);
  const tokenSymbol = deposits[0]?.tokenSymbol ?? token?.symbol ?? 'USDC';

  // Ganancia estimada (proyección a vencimiento, la misma que muestra cada
  // tarjeta de depósito) desglosada por origen. Cada depósito reporta su
  // estimación según el APY de su propio lock period (ver DepositEarningsReporter),
  // porque ese APY se obtiene con un hook y no se puede recorrer en bucle aquí.
  const [earningsById, setEarningsById] = useState<Record<number, DepositEarnings>>({});
  const reportEarnings = useCallback((id: number, earnings: DepositEarnings) => {
    setEarningsById((prev) => {
      const current = prev[id];
      if (current && current.vaquita === earnings.vaquita && current.protocol === earnings.protocol) {
        return prev;
      }
      return { ...prev, [id]: earnings };
    });
  }, []);

  const { vaquitaEarnings, protocolEarnings } = activeDeposits.reduce(
    (acc, d) => {
      const earnings = earningsById[d.id];
      if (earnings) {
        acc.vaquitaEarnings += earnings.vaquita;
        acc.protocolEarnings += earnings.protocol;
      }
      return acc;
    },
    { vaquitaEarnings: 0, protocolEarnings: 0 },
  );
  const totalEstimatedEarnings = vaquitaEarnings + protocolEarnings;

  // Con depósitos inyectados (tutorial) no esperamos a las queries reales.
  const isLoading = !injectedDeposits && isLoadingDeposits;

  // Detalle dentro del MISMO modal (igual que la lista de depósitos): al
  // seleccionar una vaquita pintamos su detalle aquí, con flecha de "atrás", en
  // vez de abrir un 2º modal encima. El tutorial usa el mismo detalle inline en
  // modo simulado (sin segundo modal).
  const inDetail = !!selectedVaquita;
  const { data: fullDeposit } = useDeposit(selectedVaquita?.id ?? 0);
  // En tutorial el depósito vive en `injectedDeposits` y se recalcula en cada
  // render (cuenta regresiva), así que tomamos la versión viva por id; en modo
  // real refrescamos el contador con useDeposit.
  const detailVaquita = !inDetail
    ? null
    : simulate
      ? deposits.find((d) => d.id === selectedVaquita!.id) ?? selectedVaquita
      : fullDeposit ?? selectedVaquita;
  const backToList = () => {
    setSelectedVaquita(null);
    onDetailOpenChange?.(false);
  };
  const detail = useVaquitaDetail({
    vaquita: detailVaquita,
    onClose: backToList,
    isLeaderboard: false,
    simulate,
    simulateInterest,
    onSimulatedWithdraw,
    // Bloquea el Cancel del detalle (solo aplica a la pantalla de detalle; la de
    // confirmación usa otro footer, donde el Cancel sigue habilitado).
    lockClose: lockToWithdraw,
  });
  const detailReady = inDetail && detail.ready;

  // Avisamos al orquestador (tutorial) cuando se entra/sale de "Confirm
  // withdrawal" para que muestre el aviso de paciencia encima.
  useEffect(() => {
    onConfirmingChange?.(inDetail && detail.isConfirming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inDetail, detail.isConfirming]);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      isDismissable={!detail.loading && !lockToWithdraw}
      hideClose={lockToWithdraw}
      onBack={inDetail && !detail.loading && !lockToWithdraw ? backToList : undefined}
      title={inDetail ? detail.title : t('deposit.bank.title', 'Bank Rewards')}
      titleIcon={inDetail ? '/icons/bag.svg' : undefined}
      titleIconAlt={inDetail ? 'vaquita' : 'rewards'}
      size="lg"
      bodyClassName={inDetail ? 'flex flex-col gap-5 pb-6' : undefined}
      footer={detailReady ? detail.footer : undefined}
    >
      {inDetail ? (
        detail.body
      ) : isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Spinner size="lg" color="accent" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Reporta la ganancia estimada de cada depósito activo para sumar el total. */}
          {activeDeposits.map((d) => (
            <DepositEarningsReporter key={d.id} deposit={d} onReport={reportEarnings} />
          ))}

          {/* Métrica principal: total depositado (lo más grande) */}
          <div className="border border-black border-b-2 rounded-xl bg-primary/10 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Image src="/icons/bag.svg" alt="bag" width={18} height={18} />
              <p className="text-xs text-primary font-semibold uppercase tracking-wide">{t('deposit.bank.myDeposits', 'My deposits')}</p>
            </div>
            <p className="text-4xl font-bold text-primary leading-tight">
              {activeDepositsTotalAmount.toFixed(2)}
              <span className="text-lg ml-1 font-semibold">{tokenSymbol}</span>
            </p>
          </div>

          {/* Segunda métrica: ganancias ganadas hasta ahora, con desglose */}
          <div className="border border-black border-b-2 rounded-xl bg-success/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowEarningsInfo((v) => !v)}
              className="w-full flex items-center justify-between gap-3 p-4 hover:bg-success/5 transition-colors text-left"
            >
              <div>
                <p className="text-xs text-success/80 font-semibold uppercase tracking-wide">
                  {t('deposit.bank.estimatedEarningsTotal', 'Estimated earnings total')}
                </p>
                <p className="text-2xl font-bold text-success leading-tight">
                  {totalEstimatedEarnings.toFixed(2)}
                  <span className="text-sm ml-1 font-semibold">{tokenSymbol}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-success font-semibold shrink-0">
                <span>{showEarningsInfo ? t('deposit.bank.hide', 'Hide') : t('deposit.bank.details', 'Details')}</span>
                <span className={'transition-transform ' + (showEarningsInfo ? 'rotate-180' : '')}>▾</span>
              </div>
            </button>
            {showEarningsInfo && (
              <div className="border-t border-black/10 px-4 py-3 space-y-3 bg-white/60">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                      <span className="text-sm font-medium text-black">{t('deposit.bank.vaquitaRewards', 'Vaquita rewards')}</span>
                      <span className="text-[10px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">
                        {vaquitaApy.toFixed(2)}% APY
                      </span>
                    </div>
                    <span className="text-sm font-bold text-black tabular-nums">
                      +{vaquitaEarnings.toFixed(2)} {tokenSymbol}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 ml-5 mt-0.5">
                    {t('deposit.bank.vaquitaRewardsInfo', 'Rewards from the Vaquita community pool, based on your lock period.')}
                  </p>
                </div>
                <div className="pt-3 border-t border-black/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-success" />
                      <span className="text-sm font-medium text-black">
                        {lendingMarketName
                          ? t('deposit.bank.marketRewards', '{{market}} rewards', { market: lendingMarketName })
                          : t('deposit.bank.protocolRewards', 'Protocol rewards')}
                      </span>
                      <span className="text-[10px] font-bold text-success bg-success/15 px-1.5 py-0.5 rounded-full">
                        {protocolApy.toFixed(2)}% APY
                      </span>
                    </div>
                    <span className="text-sm font-bold text-black tabular-nums">
                      +{protocolEarnings.toFixed(2)} {tokenSymbol}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 ml-5 mt-0.5">
                    {t('deposit.bank.protocolRewardsInfo', 'Yield from {{market}} where your funds are deposited.', {
                      market: lendingMarketName || t('deposit.bank.theLendingProtocol', 'the lending protocol'),
                    })}
                  </p>
                </div>
                <p className="text-xs text-gray-500 leading-snug pt-3 border-t border-black/10">
                  {t('deposit.bank.estimatesDisclaimer', 'These are estimates and update over time — final rewards are confirmed when you withdraw.')}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-black">{t('deposit.bank.myDeposits', 'My deposits')}</h3>
            {/* Mismos tabs Activos/Retirados que VaquitasListModal; los retirados
                distinguen retiro a tiempo de retiro anticipado. */}
            <DepositListTabs
              tab={tab}
              onTabChange={setTab}
              activeCount={activeDeposits.length}
              withdrawnCount={withdrawnDeposits.length}
            />
            {tab === 'active' ? (
              activeDeposits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-black/20 rounded-xl">
                  <Image src="/no_data.svg" alt={t('deposit.list.noData', 'No data')} width={80} height={80} />
                  <p className="text-gray-500 text-sm mt-2">{t('deposit.list.noActiveDeposits', 'No active deposits')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeDeposits.map((deposit) => (
                    <div key={deposit.id} data-tutorial={simulate ? 'tutorial-vaquita-card' : undefined}>
                      <VaquitaDepositCard
                        deposit={deposit}
                        onPress={() => {
                          setSelectedVaquita(deposit);
                          onDetailOpenChange?.(true);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )
            ) : withdrawnDeposits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-black/20 rounded-xl">
                <Image src="/no_data.svg" alt={t('deposit.list.noData', 'No data')} width={80} height={80} />
                <p className="text-gray-500 text-sm mt-2">{t('deposit.list.noWithdrawnDeposits', 'No withdrawn deposits')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {withdrawnDeposits.map((deposit) => (
                  <WithdrawnDepositCard
                    key={deposit.id}
                    deposit={deposit}
                    onPress={() => {
                      setSelectedVaquita(deposit);
                      onDetailOpenChange?.(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border border-black/10 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowHowItWorks((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm font-semibold text-black">{t('deposit.bank.howRewardsWork', 'How rewards work')}</span>
              </div>
              <span className={'text-black/60 transition-transform ' + (showHowItWorks ? 'rotate-180' : '')}>
                ▾
              </span>
            </button>
            {showHowItWorks && (
              <ul className="px-4 pb-4 pt-1 text-sm text-gray-700 space-y-1.5 list-disc list-inside">
                <li>{t('deposit.bank.howItWorks1', 'Your deposit generates yield from multiple sources.')}</li>
                <li>{t('deposit.bank.howItWorks2', 'Estimated rewards are calculated using the current APY.')}</li>
                <li>{t('deposit.bank.howItWorks3', 'The APY is dynamic and may fluctuate based on user activity and total deposits.')}</li>
                <li>{t('deposit.bank.howItWorks4', 'Rewards become claimable only after the saving period ends.')}</li>
                <li>{t('deposit.bank.howItWorks5', 'Final rewards are confirmed upon withdrawal.')}</li>
              </ul>
            )}
          </div>

          {network && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 pt-1">
              <span>{t('deposit.bank.network', 'Network:')}</span>
              <span className="font-semibold text-black">{network.networkName}</span>
            </div>
          )}
        </div>
      )}
    </AppModal>
  );
}

'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { formatUsd } from '@/core-ui/helpers/numbers';
import { formatTimeDeposit } from '@/core-ui/helpers/time';
import { useApyByLockPeriods, useDepositsComplete } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight } from 'react-icons/fi';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { EarningsBreakdown } from '../../molecules/EarningsBreakdown';
import { AllocationDetailSheet } from './AllocationDetailSheet';
import { MoveFundsSheet } from './MoveFundsSheet';
import { getAllocationStyle } from './allocationStyles';
import { Allocation, PortfolioPanelProps } from './types';

/**
 * Pantalla completa de inversión que abre el chip de APY del header. Muestra el
 * APY combinado, cómo está repartido el capital entre los plazos disponibles
 * (una fila por lock period del token) y el desglose de la ganancia estimada.
 *
 * Desde acá se entra al detalle de cada plazo y a mover fondos entre plazos.
 */
export function PortfolioPanel({
  open,
  onOpenChange,
  vaquitaEarnings,
  protocolEarnings,
  protocolApy,
  lendingMarketName,
  tokenSymbol = 'USDC',
}: PortfolioPanelProps) {
  const { t } = useTranslation();
  const { walletAddress, token, lockPeriod: selectedLockPeriod } = useConfigStore();
  const { data: depositsData } = useDepositsComplete(walletAddress);

  const [detailLockPeriod, setDetailLockPeriod] = useState<number | null>(null);
  const [moveToLockPeriod, setMoveToLockPeriod] = useState<number | null>(null);
  const [showMove, setShowMove] = useState(false);
  const detailMounted = useModalPresence(detailLockPeriod !== null);
  const moveMounted = useModalPresence(showMove);

  // Plazos ofrecidos por el token, de menor a mayor: define el orden de la lista
  // y, con él, el color/ícono de cada fila (ver allocationStyles).
  const lockPeriods = useMemo(
    () => [...(token?.lockPeriods ?? [])].filter((p) => p > 0).sort((a, b) => a - b),
    [token?.lockPeriods],
  );
  const { byLockPeriod, isLoading: apyLoading } = useApyByLockPeriods(lockPeriods, token?.symbol ?? '');

  // Capital por plazo: los depósitos activos agrupados por su propio lockPeriod.
  const allocations: Allocation[] = useMemo(() => {
    const { activeDeposits } = getDepositsData(depositsData?.deposits ?? []);
    const amountByLockPeriod = activeDeposits.reduce<Record<number, number>>((acc, deposit) => {
      acc[deposit.lockPeriod] = (acc[deposit.lockPeriod] ?? 0) + deposit.amount;
      return acc;
    }, {});

    return lockPeriods.map((lp) => {
      const apy = byLockPeriod[lp];
      return {
        lockPeriod: lp,
        label: formatTimeDeposit(lp),
        amount: amountByLockPeriod[lp] ?? 0,
        apy: (apy?.vaquitaApy ?? 0) + (apy?.protocolApy ?? 0),
        vaquitaApy: apy?.vaquitaApy ?? 0,
        protocolApy: apy?.protocolApy ?? 0,
        lendingMarketName: apy?.lendingMarketName,
      };
    });
  }, [depositsData, lockPeriods, byLockPeriod]);

  const totalAmount = allocations.reduce((acc, a) => acc + a.amount, 0);
  // APY combinado ponderado por capital. Sin capital todavía no hay mezcla que
  // mostrar, así que se cae al APY del plazo elegido en el home.
  const blendedApy =
    totalAmount > 0
      ? allocations.reduce((acc, a) => acc + a.amount * a.apy, 0) / totalAmount
      : (allocations.find((a) => a.lockPeriod === selectedLockPeriod) ?? allocations[0])?.apy ?? 0;

  // Mover fondos necesita al menos dos plazos y algo de capital que mover.
  const canManage = allocations.length >= 2 && totalAmount > 0;

  const detailAllocation = allocations.find((a) => a.lockPeriod === detailLockPeriod) ?? null;
  const detailIndex = allocations.findIndex((a) => a.lockPeriod === detailLockPeriod);

  const openMove = (toLockPeriod: number | null) => {
    setMoveToLockPeriod(toLockPeriod);
    setDetailLockPeriod(null);
    setShowMove(true);
  };

  // Placeholder: mover entre plazos implica retirar y volver a depositar, y el
  // contrato hoy solo retira la posición entera pagando al firmante
  // (contracts/vaquita-pool/src/lib.rs:168). Se conecta al backend después.
  const handleMoveSubmit = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1800));
  };

  return (
    <>
      <AppModal
        open={open}
        onOpenChange={onOpenChange}
        title={t('portfolio.title', 'Portfolio')}
        size="lg"
        fullScreen
        slideFrom="right"
        bodyClassName="flex flex-col gap-6 pb-10"
      >
        {/* Resumen: lo que rinde hoy el conjunto y cuánto capital hay puesto. */}
        <div className="pt-2">
          <p className="text-5xl font-bold text-black tabular-nums leading-none">
            {apyLoading && totalAmount === 0 ? '—' : `${blendedApy.toFixed(2)}%`}
          </p>
          <p className="mt-1.5 text-sm text-gray-500">{t('portfolio.blendedApy', 'Your APY · blended')}</p>
          <p className="mt-3 text-sm text-gray-500">
            {t('portfolio.totalBalance', 'Total balance')}:{' '}
            <span className="font-bold text-black tabular-nums">{formatUsd(totalAmount)}</span>
          </p>
        </div>

        {/* Allocation: una fila por plazo, ordenadas de más corto a más largo. */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-sm font-bold text-black">{t('portfolio.allocation', 'Allocation')}</h3>
            {canManage ? (
              <button
                type="button"
                onClick={() => openMove(null)}
                className="flex items-center gap-1 bg-transparent text-sm font-bold text-black"
              >
                {t('portfolio.manage', 'Manage allocations')}
                <FiChevronRight className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          {allocations.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              {t('portfolio.empty', 'No saving terms available yet.')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {allocations.map((allocation, index) => {
                const style = getAllocationStyle(index);
                return (
                  <button
                    key={allocation.lockPeriod}
                    type="button"
                    onClick={() => setDetailLockPeriod(allocation.lockPeriod)}
                    className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3 text-left transition hover:bg-[#F5FBFF]"
                  >
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${style.chip}`}>
                      {style.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-black truncate">{allocation.label}</span>
                      <span className="block text-xs text-gray-500 tabular-nums">
                        {formatUsd(allocation.amount)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${style.chip}`}
                    >
                      {allocation.apy.toFixed(2)}%
                    </span>
                    <FiChevronRight className="w-5 h-5 text-black shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Ganancia estimada: el mismo desglose que mostraba el chip de APY. */}
        <div>
          <h3 className="text-sm font-bold text-black mb-2">{t('portfolio.rewards', 'Rewards')}</h3>
          <EarningsBreakdown
            vaquitaEarnings={vaquitaEarnings}
            protocolEarnings={protocolEarnings}
            protocolApy={protocolApy}
            lendingMarketName={lendingMarketName}
            tokenSymbol={tokenSymbol}
          />
          <p className="mt-3 text-xs text-gray-500 leading-relaxed">
            {t(
              'deposit.bank.estimatesDisclaimer',
              'These are estimates and update over time final rewards are confirmed when you withdraw.',
            )}
          </p>
        </div>
      </AppModal>

      {detailMounted && detailAllocation ? (
        <AllocationDetailSheet
          open={detailLockPeriod !== null}
          onOpenChange={() => setDetailLockPeriod(null)}
          allocation={detailAllocation}
          style={getAllocationStyle(detailIndex)}
          tokenSymbol={tokenSymbol}
          canManage={canManage}
          onManage={() => openMove(detailAllocation.lockPeriod)}
        />
      ) : null}

      {moveMounted ? (
        <MoveFundsSheet
          open={showMove}
          onOpenChange={() => setShowMove(false)}
          allocations={allocations}
          initialToLockPeriod={moveToLockPeriod ?? undefined}
          onSubmit={handleMoveSubmit}
        />
      ) : null}
    </>
  );
}

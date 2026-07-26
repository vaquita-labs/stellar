'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { formatUsd } from '@/core-ui/helpers/numbers';
import { formatTimeDeposit } from '@/core-ui/helpers/time';
import { useApyByLockPeriods, useBlendPosition, useDepositsComplete } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight } from 'react-icons/fi';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { AllocationDetailSheet } from './AllocationDetailSheet';
import { BlendDetailSheet } from './BlendDetailSheet';
import { InvestModal } from './InvestModal';
import { getAllocationStyle } from './allocationStyles';
import { Allocation, PortfolioPanelProps } from './types';
import { PressableButton } from '../../molecules/PressableButton';

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
  // Nivel base del portafolio: depósito directo a Blend, líquido (sin lock).
  // Se lee on-chain y va aparte de las allocations por plazo (no entra en el
  // mover-fondos ni en los detalles de plazo, que son solo para locks).
  const { data: blendPosition } = useBlendPosition(walletAddress);
  const blendBalance = blendPosition?.usdc ?? 0;
  const blendApy = blendPosition?.apy ?? 0;

  const router = useRouter();
  // Detalle de Blend (qué es + números).
  const [showBlendDetail, setShowBlendDetail] = useState(false);
  const blendDetailMounted = useModalPresence(showBlendDetail);
  // Detalle de un plazo (info + botón de retiro), como el de Blend pero para
  // cada lock period. Tocar una fila lo abre; el retiro sale desde acá.
  const [detailLockPeriod, setDetailLockPeriod] = useState<number | null>(null);
  const detailMounted = useModalPresence(detailLockPeriod !== null);
  // "Invertir": abre el InvestModal (teclado + selector de plazo/APY; la plata
  // sale de Blend y se lockea en el Vaquita pool).
  const [showDeposit, setShowDeposit] = useState(false);
  const depositMounted = useModalPresence(showDeposit);

  // Retirar navega a /portafolio con ese plazo ya filtrado (la lista de
  // posiciones a retirar). NO cerramos el panel: como está abierto por URL
  // (/home?portfolio=1), ese entry queda en el historial y el botón atrás de
  // /portafolio vuelve al panel abierto.
  const goToTerm = (lockPeriod: number) => {
    router.push(`/portafolio?period=${lockPeriod}`);
  };

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

  // Capital en locks (alimenta mover-fondos y el APY ponderado de los plazos).
  const lockTotal = allocations.reduce((acc, a) => acc + a.amount, 0);
  // Balance total del portafolio = locks + Blend (nivel base). Es el número que
  // el usuario espera ver como "todo lo que tiene invertido".
  const totalAmount = lockTotal + blendBalance;
  const totalEarnings = vaquitaEarnings + protocolEarnings;
  // APY combinado ponderado por capital, incluyendo Blend con su propio APY. Sin
  // capital todavía no hay mezcla que mostrar, así que se cae al APY del plazo
  // elegido en el home.
  const blendedApy =
    totalAmount > 0
      ? (allocations.reduce((acc, a) => acc + a.amount * a.apy, 0) + blendBalance * blendApy) /
        totalAmount
      : (allocations.find((a) => a.lockPeriod === selectedLockPeriod) ?? allocations[0])?.apy ?? 0;

  const detailAllocation = allocations.find((a) => a.lockPeriod === detailLockPeriod) ?? null;
  const detailIndex = allocations.findIndex((a) => a.lockPeriod === detailLockPeriod);
  // Al cerrar, detailLockPeriod vuelve a null antes de que termine la animación
  // de salida. Retenemos el último plazo para que el sheet siga teniendo qué
  // renderizar mientras se va, y no desaparezca de golpe.
  const lastDetailRef = useRef<{ allocation: Allocation; index: number } | null>(null);
  if (detailAllocation) lastDetailRef.current = { allocation: detailAllocation, index: detailIndex };
  const detailView = detailAllocation ? { allocation: detailAllocation, index: detailIndex } : lastDetailRef.current;

  return (
    <>
      <AppModal
        open={open}
        onOpenChange={onOpenChange}
        title={t('portfolio.title', 'Portfolio')}
        size="lg"
        fullScreen
        slideFrom="right"
        bodyClassName="flex flex-col gap-5 pb-10"
        footer={
          <PressableButton variant="success" size="cta" className="py-2.5!" onClick={() => setShowDeposit(true)}>
            {t('portfolio.invest', 'Invest')}
          </PressableButton>
        }
      >
        {/* Encabezado: lo que se está ganando, que es lo que el usuario viene a
            ver. El APY y el capital quedan en una línea secundaria, y el
            "de dónde sale" se despliega solo si lo pide. Sin tarjeta: es el
            contenido principal de la pantalla, no un bloque más. */}
        {/* El balance es la plata en Blend (nivel base): tocarlo abre el detalle
            de Blend. Por eso Blend ya no va como fila en la lista de abajo. */}
        <button
          type="button"
          onClick={() => setShowBlendDetail(true)}
          className="pt-2 w-full text-left transition active:opacity-80"
        >
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
            {t('portfolio.totalBalance', 'Total balance')}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-5xl font-bold text-success tabular-nums leading-none">
            <span>
              {totalAmount.toFixed(2)}
              <span className="text-2xl ml-1.5 font-semibold">{tokenSymbol}</span>
            </span>
            <FiChevronRight className="w-6 h-6 text-black/40 shrink-0" />
          </p>
          <p className="mt-3 text-sm text-gray-500">
            <span className="font-bold text-black tabular-nums">
              {apyLoading && totalAmount === 0 ? '—' : `${blendedApy.toFixed(2)}%`} APY
            </span>
            <span className="mx-1.5">·</span>
            {t('portfolio.earning', 'Earning')}{' '}
            <span className="font-bold text-success tabular-nums">
              +{totalEarnings.toFixed(2)} {tokenSymbol}
            </span>
          </p>
        </button>

        {/* El "de dónde sale" ya no es un desglose global: cada allocation lo
            explica en su propio detalle (tocá una fila). */}
        <div className="-mt-1 border-t border-black/10" />

        {/* Allocation: una fila por plazo, ordenadas de más corto a más largo. */}
        <div>
          <div className="mb-2">
            <h3 className="text-sm font-bold text-black">{t('portfolio.allocation', 'Allocation')}</h3>
          </div>

          {allocations.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              {t('portfolio.empty', 'No saving terms available yet.')}
            </p>
          ) : (
            // Lista agrupada (no cards sueltas): solo los plazos con lock. Blend
            // ya no va acá: se accede tocando el balance de arriba.
            <div className="flex flex-col divide-y divide-black/10 rounded-lg border border-black/10 overflow-hidden bg-white">
              {allocations.map((allocation, index) => {
                const style = getAllocationStyle(index);
                return (
                  <button
                    type="button"
                    key={allocation.lockPeriod}
                    onClick={() => setDetailLockPeriod(allocation.lockPeriod)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition active:bg-black/[0.04]"
                  >
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${style.chip}`}>
                      {style.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-black truncate">{allocation.label}</span>
                      <span className="block text-xs text-gray-500 tabular-nums">
                        {formatUsd(allocation.amount)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${style.chip}`}
                    >
                      {allocation.apy.toFixed(2)}%
                    </span>
                    <FiChevronRight className="w-4 h-4 text-black/50 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </AppModal>

      {detailMounted && detailView ? (
        <AllocationDetailSheet
          open={detailLockPeriod !== null}
          onOpenChange={() => setDetailLockPeriod(null)}
          allocation={detailView.allocation}
          style={getAllocationStyle(detailView.index)}
          tokenSymbol={tokenSymbol}
          onWithdraw={() => goToTerm(detailView.allocation.lockPeriod)}
        />
      ) : null}

      {blendDetailMounted ? (
        <BlendDetailSheet
          open={showBlendDetail}
          onOpenChange={() => setShowBlendDetail(false)}
          amount={blendBalance}
          apy={blendApy}
          tokenSymbol={tokenSymbol}
        />
      ) : null}

      {depositMounted ? (
        <InvestModal open={showDeposit} onOpenChange={() => setShowDeposit(false)} />
      ) : null}
    </>
  );
}

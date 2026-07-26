'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { formatUsd } from '@/core-ui/helpers/numbers';
import { formatTimeDeposit } from '@/core-ui/helpers/time';
import { useApyByLockPeriods, useBlendPosition, useDepositsComplete } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { IoWalletOutline } from 'react-icons/io5';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { EarningsBreakdown } from '../../molecules/EarningsBreakdown';
import { AllocationDetailSheet } from './AllocationDetailSheet';
import { MoveFundsSheet } from './MoveFundsSheet';
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

  const [detailLockPeriod, setDetailLockPeriod] = useState<number | null>(null);
  const [moveToLockPeriod, setMoveToLockPeriod] = useState<number | null>(null);
  const [showMove, setShowMove] = useState(false);
  // El desglose de la ganancia arranca cerrado: es el "si querés ver más".
  const [showEarningsDetail, setShowEarningsDetail] = useState(false);
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

  // Mover fondos necesita al menos dos plazos y algo de capital EN LOCKS que
  // mover (Blend no participa del move entre plazos todavía).
  const canManage = allocations.length >= 2 && lockTotal > 0;

  const detailAllocation = allocations.find((a) => a.lockPeriod === detailLockPeriod) ?? null;
  const detailIndex = allocations.findIndex((a) => a.lockPeriod === detailLockPeriod);
  // Al cerrar, detailLockPeriod vuelve a null antes de que termine la animación
  // de salida. Retenemos el último plazo para que el sheet siga teniendo qué
  // renderizar mientras se va, y no desaparezca de golpe.
  const lastDetailRef = useRef<{ allocation: Allocation; index: number } | null>(null);
  if (detailAllocation) lastDetailRef.current = { allocation: detailAllocation, index: detailIndex };
  const detailView = detailAllocation ? { allocation: detailAllocation, index: detailIndex } : lastDetailRef.current;

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
        bodyClassName="flex flex-col gap-5 pb-10"
      >
        {/* Encabezado: lo que se está ganando, que es lo que el usuario viene a
            ver. El APY y el capital quedan en una línea secundaria, y el
            "de dónde sale" se despliega solo si lo pide. Sin tarjeta: es el
            contenido principal de la pantalla, no un bloque más. */}
        <div className="pt-2">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
            {t('deposit.bank.estimatedEarningsTotal', 'Estimated earnings total')}
          </p>
          <p className="mt-1 text-5xl font-bold text-success tabular-nums leading-none">
            {totalEarnings.toFixed(2)}
            <span className="text-2xl ml-1.5 font-semibold">{tokenSymbol}</span>
          </p>
          <p className="mt-3 text-sm text-gray-500">
            <span className="font-bold text-black tabular-nums">
              {apyLoading && totalAmount === 0 ? '—' : `${blendedApy.toFixed(2)}%`} APY
            </span>
            <span className="mx-1.5">·</span>
            {t('portfolio.totalBalance', 'Total balance')}:{' '}
            <span className="font-bold text-black tabular-nums">{formatUsd(totalAmount)}</span>
          </p>
        </div>

        {/* Banda del "More info": las dos líneas la separan del resumen de
            arriba y de la lista de abajo, y encierran el desglose al abrirlo. */}
        <div className="-mt-1 border-y border-black/10">
          <button
            type="button"
            onClick={() => setShowEarningsDetail((v) => !v)}
            aria-expanded={showEarningsDetail}
            className="w-full flex items-center justify-between gap-2 bg-transparent py-3 text-sm font-bold text-black"
          >
            {t('portfolio.moreInfo', 'More info')}
            <FiChevronDown className={`w-4 h-4 transition-transform ${showEarningsDetail ? 'rotate-180' : ''}`} />
          </button>

          {showEarningsDetail ? (
            <div className="pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
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
          ) : null}
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

          {allocations.length === 0 && blendBalance <= 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              {t('portfolio.empty', 'No saving terms available yet.')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Nivel base: lo que está en Blend, líquido y sin lock. Fila
                  informativa; el retiro se hace desde el botón "Withdraw" del
                  home (Blend es el modo normal). Se muestra solo si hay algo. */}
              {blendBalance > 0 ? (
                <div className="w-full flex items-center gap-3 rounded-lg border border-black/10 bg-white px-4 py-2.5">
                  <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-success/20 text-success">
                    <IoWalletOutline className="w-5 h-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-black truncate">
                      {t('portfolio.blend.label', 'Blend · Flexible')}
                    </span>
                    <span className="block text-xs text-gray-500 tabular-nums">
                      {formatUsd(blendBalance)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums bg-success/20 text-success">
                    {blendApy.toFixed(2)}%
                  </span>
                </div>
              ) : null}
              {allocations.map((allocation, index) => {
                const style = getAllocationStyle(index);
                return (
                  <PressableButton variant="white" size="row"
                    key={allocation.lockPeriod}
                    onClick={() => setDetailLockPeriod(allocation.lockPeriod)}>
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
                  </PressableButton>
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
          canManage={canManage}
          onManage={() => openMove(detailView.allocation.lockPeriod)}
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

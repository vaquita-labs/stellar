'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { formatUsd } from '@/core-ui/helpers/numbers';
import { formatTimeDeposit } from '@/core-ui/helpers/time';
import { useApyByLockPeriods, useBlendPosition, useDepositsComplete } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight } from 'react-icons/fi';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { DepositEarnings, DepositEarningsReporter } from '../../home/DepositEarningsReporter';
import { AllocationDetailSheet } from './AllocationDetailSheet';
import { BlendDetailSheet } from './BlendDetailSheet';
import { InvestModal } from './InvestModal';
import { getAllocationStyle } from './allocationStyles';
import { Allocation, PortfolioPanelProps } from './types';
import { PressableButton } from '../../molecules/PressableButton';

/**
 * Pantalla completa de inversión que abre el chip de APY del header. Muestra la
 * ganancia estimada y cómo está repartido el capital entre los plazos
 * disponibles (una fila por lock period del token). El APY no se combina a nivel
 * portafolio a propósito: cada plazo usa un rate tipo APR y Blend un APY real,
 * mezclarlos en un solo número sería juntar unidades distintas. El APY vive en
 * cada fila/detalle, no en el encabezado.
 *
 * Desde acá se entra al detalle de cada plazo y a mover fondos entre plazos.
 */
export function PortfolioPanel({
  open,
  onOpenChange,
  tokenSymbol = 'USDC',
}: PortfolioPanelProps) {
  const { t } = useTranslation();
  const { walletAddress, token } = useConfigStore();
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
  // posiciones a retirar). El panel queda montado detrás (misma ruta
  // interceptada, solo cambia `?period`), así el push/pop anima la hoja de
  // posiciones sobre él. Cerramos el detalle del plazo para no dejarlo apilado
  // debajo de la lista.
  const goToTerm = (lockPeriod: number) => {
    setDetailLockPeriod(null);
    router.push(`/portafolio?period=${lockPeriod}`);
  };

  // Plazos ofrecidos por el token, de menor a mayor: define el orden de la lista
  // y, con él, el color/ícono de cada fila (ver allocationStyles).
  const lockPeriods = useMemo(
    () => [...(token?.lockPeriods ?? [])].filter((p) => p > 0).sort((a, b) => a - b),
    [token?.lockPeriods],
  );
  const { byLockPeriod } = useApyByLockPeriods(lockPeriods, token?.symbol ?? '');

  // Depósitos activos (con lock): la fuente tanto de las allocations por plazo
  // como de la ganancia estimada del header.
  const activeDeposits = useMemo(
    () => getDepositsData(depositsData?.deposits ?? []).activeDeposits,
    [depositsData],
  );

  // Ganancia estimada: cada depósito reporta su proyección según el APY de su
  // propio lock period (mismo cálculo que la card). Antes lo agregaba el
  // HeaderStats y lo pasaba por props; como el panel ya no vive dentro del
  // header (se abre por la ruta /portafolio), lo calcula él mismo.
  const [earningsById, setEarningsById] = useState<Record<number, DepositEarnings>>({});
  const reportEarnings = useCallback((id: number, earnings: DepositEarnings) => {
    setEarningsById((prev) => {
      const current = prev[id];
      if (
        current &&
        current.vaquita === earnings.vaquita &&
        current.protocol === earnings.protocol &&
        current.ratePerMs === earnings.ratePerMs
      ) {
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

  // Capital por plazo: los depósitos activos agrupados por su propio lockPeriod.
  const allocations: Allocation[] = useMemo(() => {
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
  }, [activeDeposits, lockPeriods, byLockPeriod]);

  // Capital en locks (alimenta mover-fondos y el APY ponderado de los plazos).
  const lockTotal = allocations.reduce((acc, a) => acc + a.amount, 0);
  // Balance total del portafolio = locks + Blend (nivel base). Es el número que
  // el usuario espera ver como "todo lo que tiene invertido".
  const totalAmount = lockTotal + blendBalance;
  const totalEarnings = vaquitaEarnings + protocolEarnings;

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
      {/* Reporta la ganancia estimada de cada depósito activo para el header. */}
      {activeDeposits.map((d) => (
        <DepositEarningsReporter key={d.id} deposit={d} onReport={reportEarnings} />
      ))}
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
          <p className="mt-1 text-5xl font-bold text-success tabular-nums leading-none">
            {totalAmount.toFixed(2)}
            <span className="text-2xl ml-1.5 font-semibold">{tokenSymbol}</span>
          </p>
          <p className="mt-3 text-sm text-gray-500">
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
            <div className="flex flex-col divide-y divide-black/10 rounded-md border border-black border-b-2 overflow-hidden bg-white">
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

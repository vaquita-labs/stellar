'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { formatTokenPrecise, formatUsdAdaptive } from '@/core-ui/helpers/numbers';
import { formatTimeDeposit } from '@/core-ui/helpers/time';
import { useApyByLockPeriods, useDepositsComplete, useLivePassiveUsdc } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiPocket } from 'react-icons/fi';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { AllocationDetailSheet } from './AllocationDetailSheet';
import { BlendDetailSheet } from './BlendDetailSheet';
import { PoolMeta } from './PoolMeta';
import { InvestModal } from './InvestModal';
import { PortfolioDonut } from './PortfolioDonut';
import { AllocationStyle, getAllocationStyle } from './allocationStyles';
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
interface PortfolioRow {
  key: string;
  /** 'blend' = base líquida/flexible; 'lock' = un plazo con lock. */
  kind: 'blend' | 'lock';
  /** Solo en filas 'lock': identidad del plazo (ms). */
  lockPeriod?: number;
  label: string;
  amount: number;
  /** Solo filas 'blend': el APY real del vault (líquido). Los locks no muestran %. */
  apy: number;
  /** Solo filas 'lock': premios del pool + posiciones abiertas (en vez del %). */
  rewardPool?: number;
  openPositions?: number;
  style: AllocationStyle;
}

export function PortfolioPanel({
  open,
  onOpenChange,
  tokenSymbol = 'USDC',
}: PortfolioPanelProps) {
  const { t } = useTranslation();
  const { walletAddress, token } = useConfigStore();
  const {
    data: depositsData,
    isFetching: depositsFetching,
    refetch: refetchDeposits,
  } = useDepositsComplete(walletAddress);

  // Abrir el panel revalida los depósitos. El caché persistido pinta al toque
  // los últimos valores conocidos y este refetch los corrige si otra sesión
  // depositó/retiró mientras este tab no estaba escuchando el canal de Ably.
  // Va sobre `open` y no sobre el montaje porque el panel queda montado detrás
  // de la hoja de posiciones (ver PortfolioFlow): reabrirlo no lo remonta.
  useEffect(() => {
    if (open) refetchDeposits();
  }, [open, refetchDeposits]);
  // Nivel base del portafolio: la posición pasiva, líquida (sin lock) — el vault
  // de DeFindex con el flag on, si no el depósito directo a Blend. Se lee on-chain
  // y va aparte de las allocations por plazo (no entra en el mover-fondos ni en
  // los detalles de plazo, que son solo para locks).
  // `live`: saldo proyectado en vivo, la MISMA fuente que el header y el
  // "Available" del retiro, así el total del portfolio corre igual y coincide
  // con ellos.
  const { apy: passiveApy, isFetching: passiveFetching, live: passiveBalance } =
    useLivePassiveUsdc(walletAddress);

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
  // Plazo con el que se abre "Invertir". null = botón general del footer (arranca
  // en el plazo más corto); un valor = tocaron "Invertir" en un plan vacío y ese
  // plazo queda preseleccionado en el teclado.
  const [investLockPeriod, setInvestLockPeriod] = useState<number | null>(null);
  const openInvest = (lockPeriod: number | null) => {
    setInvestLockPeriod(lockPeriod);
    setShowDeposit(true);
  };

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
        rewardPool: apy?.rewardPool ?? 0,
        openPositions: apy?.openPositions ?? 0,
        totalDeposits: apy?.totalDeposits ?? 0,
      };
    });
  }, [activeDeposits, lockPeriods, byLockPeriod]);

  // Capital en locks (alimenta mover-fondos y el APY ponderado de los plazos).
  const lockTotal = allocations.reduce((acc, a) => acc + a.amount, 0);
  // Balance total del portafolio = locks + Blend (nivel base). Es el número que
  // el usuario espera ver como "todo lo que tiene invertido".
  const totalAmount = lockTotal + passiveBalance;

  // Tras un invest/retiro, Blend (nivel base) y los depósitos (locks) se re-leen
  // por separado y asientan en momentos distintos: si ponés 2 de Blend en un
  // plazo, Blend baja a −2 unos segundos ANTES de que el nuevo lock aparezca, y
  // el total pega un bajón visible (6 → 4 → 6) que asusta. Mientras cualquiera de
  // las dos fuentes se está re-sincronizando, congelamos el total en el último
  // valor estable y mostramos un spinner; al asentar ambas, snapea al valor real
  // (ya consistente), sin el salto. keepPreviousData en las queries evita el flash
  // a 0; esto evita además el bajón por desincronización entre las dos.
  const isSyncing = depositsFetching || passiveFetching;
  const lastStableTotalRef = useRef(totalAmount);
  if (!isSyncing) lastStableTotalRef.current = totalAmount;
  const displayTotal = isSyncing ? lastStableTotalRef.current : totalAmount;

  // Filas de la distribución: el nivel base (Blend, líquido/flexible) + una por
  // plazo con lock. Blend lleva su propio estilo (bolsillo/gris) porque no es un
  // plazo; cada lock hereda color/ícono por su posición corto→largo.
  const rows: PortfolioRow[] = useMemo(() => {
    const blendRow: PortfolioRow = {
      key: 'blend',
      kind: 'blend',
      label: t('portfolio.savings', 'Savings'),
      amount: passiveBalance,
      apy: passiveApy,
      style: {
        // Ahorros = tu dinero líquido/disponible: la moneda USDC (el "capital
        // semilla" antes de plantarlo en un plazo), en el mismo estilo sticker.
        // Color primary (el de marca por defecto) para que se distinga de los
        // plazos y la barra no se vea gris cuando Ahorros es lo único con fondos.
        chip: 'bg-primary/20',
        solid: 'bg-primary text-white',
        hex: '#F5A161',
        icon: <FiPocket className="w-5 h-5" />,
        image: '/icons/global/usdc.png',
      },
    };
    const lockRows: PortfolioRow[] = allocations.map((a, i) => ({
      key: `lock-${a.lockPeriod}`,
      kind: 'lock',
      lockPeriod: a.lockPeriod,
      label: a.label,
      amount: a.amount,
      apy: a.apy,
      rewardPool: a.rewardPool,
      openPositions: a.openPositions,
      style: getAllocationStyle(i),
    }));
    return [blendRow, ...lockRows];
  }, [allocations, passiveBalance, passiveApy, t]);

  // Orden de despliegue: primero lo que tiene fondos (de mayor a menor, así la
  // barra y la lista cuentan la misma historia), y al final los planes vacíos
  // como oportunidad ("Sin fondos · Invertir").
  const displayRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const aFunded = a.amount > 0 ? 1 : 0;
        const bFunded = b.amount > 0 ? 1 : 0;
        if (aFunded !== bFunded) return bFunded - aFunded;
        if (a.amount !== b.amount) return b.amount - a.amount;
        return (a.lockPeriod ?? -1) - (b.lockPeriod ?? -1);
      }),
    [rows],
  );
  const fundedRows = displayRows.filter((r) => r.amount > 0);
  const fundedCount = fundedRows.length;
  const pctOf = (amount: number) => (totalAmount > 0 ? (amount / totalAmount) * 100 : 0);

  // Número del centro del donut, partido en enteros + centavos (los centavos van
  // en superíndice, estilo "$722·⁰¹"). Con ≥1 lo mostramos a 2 decimales para que
  // quepa limpio; los micro-saldos (<1) conservan la precisión fina.
  const donutStr =
    displayTotal >= 1 ? `$${formatTokenPrecise(displayTotal, 2)}` : formatUsdAdaptive(displayTotal);
  const donutDot = donutStr.lastIndexOf('.');
  const donutInt = donutDot >= 0 ? donutStr.slice(0, donutDot) : donutStr;
  const donutCents = donutDot >= 0 ? donutStr.slice(donutDot + 1) : '';

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
        bodyClassName="flex flex-col gap-4 pb-10 overflow-x-hidden"
        footer={
          <PressableButton variant="success" size="cta" className="py-2.5!" onClick={() => openInvest(null)}>
            {t('portfolio.invest', 'Invest')}
          </PressableButton>
        }
      >
        {/* Donut de distribución con el total al centro: reemplaza el número
            grande y la barra horizontal. Cada opción con fondos es un arco de su
            color (mismos colores que los íconos de la lista). Debajo, la ganancia
            y cuántas opciones se están usando (las vacías son la oportunidad de
            rendir más). El desglose e interacción viven en la lista de abajo. */}
        <div className="flex flex-col items-center gap-1.5">
          <PortfolioDonut
            segments={rows.map((row) => ({ key: row.key, color: row.style.hex, value: row.amount }))}
            total={totalAmount}
            label={t('portfolio.total', 'Total')}
            syncing={isSyncing}
            amount={
              <>
                {donutInt}
                {donutCents ? (
                  <span className="align-super text-[0.5em] font-bold ml-0.5">{donutCents}</span>
                ) : null}
              </>
            }
          />
          {totalAmount > 0 ? (
            <p className="text-xs text-gray-500">
              {t('portfolio.distributed', 'Spread across {{funded}} of {{total}} options', {
                funded: fundedCount,
                total: rows.length,
              })}
            </p>
          ) : null}
        </div>

        {/* Distribución: una fila por opción (Ahorros + cada plazo), plana sobre el
            fondo, sin card. Con fondos → toca para ver el detalle; vacía → "Sin
            fondos" atenuado con "Invertir" al lado, que abre el teclado en ese
            plazo. */}
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            {t('portfolio.empty', 'No saving terms available yet.')}
          </p>
        ) : (
          <div className="flex flex-col">
            {displayRows.map((row) => {
              const empty = row.amount <= 0;
              const investable = row.kind === 'lock' && row.lockPeriod != null;
              const showInvest = empty && investable;
              return (
                <div
                  key={row.key}
                  className="flex items-center gap-3 border-t border-black/[0.07] first:border-t-0 py-3"
                >
                  {/* Zona izquierda: ícono + nombre + APY. Es el área tocable
                      cuando la fila tiene fondos (abre su detalle). */}
                  <button
                    type="button"
                    disabled={empty}
                    onClick={() => {
                      if (row.kind === 'blend') setShowBlendDetail(true);
                      else if (row.lockPeriod != null) setDetailLockPeriod(row.lockPeriod);
                    }}
                    className={`flex flex-1 min-w-0 items-center gap-3 text-left rounded-lg -mx-1 px-1 py-0.5 transition-colors ${
                      empty ? 'cursor-default' : 'active:bg-black/[0.04]'
                    }`}
                  >
                    {/* Disco sólido del color de la opción: amarra la fila con su
                        arco en el donut. Vacío → gris tenue (se lee "bloqueado"). */}
                    <span
                      className={`w-9 h-9 rounded-full shrink-0 ${empty ? 'bg-black/10' : row.style.solid}`}
                    />
                    <span className="flex-1 min-w-0">
                      <span
                        className={`block text-sm font-bold truncate ${empty ? 'text-gray-400' : 'text-black'}`}
                      >
                        {row.label}
                      </span>
                      {row.kind === 'lock' ? (
                        <PoolMeta
                          rewardPool={row.rewardPool ?? 0}
                          openPositions={row.openPositions ?? 0}
                          className="text-xs text-gray-500"
                        />
                      ) : (
                        <span className="block text-xs text-gray-500 tabular-nums">
                          {empty ? `${t('portfolio.noFunds', 'No funds')} · ` : ''}
                          {row.apy.toFixed(2)}% APY
                        </span>
                      )}
                    </span>
                  </button>

                  {/* Zona derecha: con fondos → monto + % del total + chevron;
                      vacía (plazo) → "Invertir". */}
                  {showInvest ? (
                    <button
                      type="button"
                      onClick={() => openInvest(row.lockPeriod ?? null)}
                      className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold text-[#1B4FCB] transition-colors active:bg-[#1B4FCB]/10"
                    >
                      {t('portfolio.invest', 'Invest')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={empty}
                      onClick={() => {
                        if (row.kind === 'blend') setShowBlendDetail(true);
                        else if (row.lockPeriod != null) setDetailLockPeriod(row.lockPeriod);
                      }}
                      className={`shrink-0 flex items-center gap-1.5 text-right ${
                        empty ? 'cursor-default' : ''
                      }`}
                    >
                      <span className="flex flex-col items-end">
                        <span className="text-sm font-bold text-black tabular-nums leading-tight">
                          {formatUsdAdaptive(row.amount)}
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums leading-tight">
                          {t('portfolio.ofTotal', '{{pct}}% of total', {
                            pct: pctOf(row.amount).toFixed(1),
                          })}
                        </span>
                      </span>
                      {empty ? null : <FiChevronRight className="w-4 h-4 text-black/40 shrink-0" />}
                    </button>
                  )}
                </div>
              );
            })}

            {/* Suma: reafirma que las filas cierran con el número de arriba. */}
            {fundedCount > 0 ? (
              <div className="flex items-center justify-between border-t border-black/15 mt-1 pt-3">
                <span className="text-sm font-semibold text-gray-500">
                  {t('portfolio.sum', 'Total')}
                </span>
                <span className="text-sm font-bold text-black tabular-nums">
                  {formatUsdAdaptive(displayTotal)}
                </span>
              </div>
            ) : null}
          </div>
        )}
      </AppModal>

      {detailMounted && detailView ? (
        <AllocationDetailSheet
          open={detailLockPeriod !== null}
          onOpenChange={() => setDetailLockPeriod(null)}
          allocation={detailView.allocation}
          style={getAllocationStyle(detailView.index)}
          tokenSymbol={tokenSymbol}
          portfolioPct={pctOf(detailView.allocation.amount)}
          onWithdraw={() => goToTerm(detailView.allocation.lockPeriod)}
        />
      ) : null}

      {blendDetailMounted ? (
        <BlendDetailSheet
          open={showBlendDetail}
          onOpenChange={() => setShowBlendDetail(false)}
          amount={passiveBalance}
          apy={passiveApy}
          tokenSymbol={tokenSymbol}
        />
      ) : null}

      {depositMounted ? (
        <InvestModal
          open={showDeposit}
          onOpenChange={() => setShowDeposit(false)}
          initialLockPeriod={investLockPeriod ?? undefined}
        />
      ) : null}
    </>
  );
}

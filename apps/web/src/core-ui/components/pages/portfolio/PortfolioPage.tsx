'use client';

import { CircleIconButton } from '@/core-ui/components/molecules/CircleIconButton';
import {
  FilterChip,
  multiSelectChips,
  PageLayout,
  TransactionList,
  TransactionMonthCard,
  WithHydrated,
} from '@/core-ui/components/molecules';
import { formatTimeDeposit } from '@/core-ui/helpers';
import { useDepositsComplete, usePositionReconcile } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO } from '@/core-ui/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilter } from 'react-icons/fi';
import { PositionInfoSheet } from './PositionInfoSheet';
import { PositionRow } from './PositionRow';
import { PositionWithdrawSheet } from './PositionWithdrawSheet';
import {
  defaultPortfolioFilters,
  hasActivePortfolioFilters,
  POSITION_STATUSES,
  PortfolioFilters,
  PortfolioFiltersModal,
  positionEndsAt,
  positionStatusOf,
  useStatusLabel,
} from './PortfolioFiltersModal';

/** Cuántas posiciones se muestran por tanda (para no renderizarlas todas). */
const PAGE_SIZE = 6;

/**
 * Ruta `/portafolio?period=…`: lista todas las posiciones del usuario (activas,
 * retiradas y con error) ordenadas por fecha de fin del lock, la que termina
 * antes arriba. Los filtros (plazo, estado, fechas) viven en el modal del
 * embudo, arrancan con todo marcado y se muestran como chips removibles arriba
 * —igual que /transactions— solo cuando dejan algo afuera. `?period=<ms>` llega
 * con ese único plazo marcado (así lo hace el PortfolioPanel al tocar un
 * plazo); `?period=all` abre la lista sin acotar. Las activas se retiran vía
 * PositionWithdrawSheet; las demás abren un detalle de solo lectura.
 */
export function PortfolioPage({ onBack }: { onBack?: () => void } = {}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { walletAddress, token } = useConfigStore();
  const { data, isLoading } = useDepositsComplete(walletAddress);
  // Closes a position the chain already released but a lost tab never reported.
  usePositionReconcile(walletAddress);

  // Plazos ofrecidos por el token, de menor a mayor (para la sección "Term").
  const lockPeriods = useMemo(
    () => [...(token?.lockPeriods ?? [])].filter((p) => p > 0).sort((a, b) => a - b),
    [token?.lockPeriods],
  );

  const statusLabelOf = useStatusLabel();

  const [selected, setSelected] = useState<DepositResponseDTO | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Detalle de solo lectura para posiciones retiradas o con error (no se retiran).
  const [infoOpen, setInfoOpen] = useState(false);

  // Filtros (plazos + estado + fechas) del embudo, y paginación de la lista. Todo
  // arranca marcado; el `?period=` de la URL, si matchea un plazo válido, deja
  // marcado solo ese plazo.
  const periodParam = Number(useSearchParams().get('period'));
  const [filters, setFilters] = useState<PortfolioFilters>(() => ({
    ...defaultPortfolioFilters(lockPeriods),
    periods: lockPeriods.includes(periodParam) ? [periodParam] : lockPeriods,
  }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const positions = useMemo(() => {
    const all = data?.deposits ?? [];
    // Fin del día del "hasta" para incluir todo ese día.
    const endInclusive = filters.endDate !== null ? filters.endDate + 86_400_000 - 1 : null;
    return (
      all
        .filter((d) => {
          const status = positionStatusOf(d);
          return status !== null && filters.statuses.includes(status);
        })
        .filter((d) => filters.periods.includes(d.lockPeriod))
        .filter((d) => filters.startDate === null || d.createdTimestamp >= filters.startDate)
        .filter((d) => endInclusive === null || d.createdTimestamp <= endInclusive)
        // La que termina antes va arriba, sin distinguir estado: una retirada
        // queda donde su fecha de fin la ponga.
        .sort((a, b) => positionEndsAt(a) - positionEndsAt(b))
    );
  }, [data, filters]);

  // Chips de los filtros aplicados (con × para quitarlos). Plazo y estado solo
  // muestran chips cuando dejan algo afuera.
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...multiSelectChips(filters.periods, lockPeriods, formatTimeDeposit, (periods) =>
      setFilters((prev) => ({ ...prev, periods })),
    ),
    ...multiSelectChips(filters.statuses, POSITION_STATUSES, statusLabelOf, (statuses) =>
      setFilters((prev) => ({ ...prev, statuses })),
    ),
  ];
  if (filters.startDate !== null) {
    chips.push({
      key: 'start',
      label: t('transactions.chips.from', 'From {{date}}', { date: fmtDate(filters.startDate) }),
      onRemove: () => setFilters((prev) => ({ ...prev, startDate: null })),
    });
  }
  if (filters.endDate !== null) {
    chips.push({
      key: 'end',
      label: t('transactions.chips.to', 'To {{date}}', { date: fmtDate(filters.endDate) }),
      onRemove: () => setFilters((prev) => ({ ...prev, endDate: null })),
    });
  }

  // Al cambiar cualquier filtro, la lista vuelve a la primera tanda.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters]);

  const visiblePositions = positions.slice(0, visibleCount);
  const hasMore = positions.length > visibleCount;
  const showSkeleton = isLoading && !data;

  return (
    <PageLayout
      title={t('portfolio.title', 'Portfolio')}
      // En el flujo de overlays, PortfolioFlow pasa un onBack que cierra la hoja
      // de posiciones y deja el panel de portafolio visible detrás. Como
      // fallback (uso directo de la página) se vuelve al entry anterior.
      onBack={onBack ?? (() => router.back())}
      headerGap="gap-3"
      rightSlot={
        <CircleIconButton
          variant={hasActivePortfolioFilters(filters, lockPeriods) ? 'primary' : 'white'}
          ariaLabel={t('transactions.filters.title', 'Filter')}
          onClick={() => setFiltersOpen(true)}
          icon={<FiFilter className="h-4 w-4" />}
        />
      }
    >
      <WithHydrated fallback={<div className="h-24" />}>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
            ))}
          </div>
        )}

        {showSkeleton ? (
          <TransactionMonthCard label="">
            <TransactionList align="grouped">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="h-8 w-8 shrink-0 rounded-md border border-black/20 bg-default-100 animate-pulse" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <span className="block h-3.5 w-24 rounded bg-default-100 animate-pulse" />
                    <span className="block h-3 w-16 rounded bg-default-100 animate-pulse" />
                  </div>
                </li>
              ))}
            </TransactionList>
          </TransactionMonthCard>
        ) : positions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-white px-4 py-10 text-center">
            <p className="text-sm font-semibold text-black">{t('portfolio.list.empty', 'No positions to show.')}</p>
            <p className="text-xs text-gray-600">{t('portfolio.list.emptyHint', 'Your locked savings will show up here.')}</p>
          </div>
        ) : (
          <>
            <TransactionMonthCard label={t('portfolio.positionsTitle', 'Your positions')}>
              <TransactionList align="grouped">
                {visiblePositions.map((deposit) => (
                  <PositionRow
                    key={deposit.id}
                    deposit={deposit}
                    onPress={() => {
                      setSelected(deposit);
                      // Activas → hoja de retiro; retiradas/con error → detalle
                      // de solo lectura (no se pueden retirar).
                      const status = positionStatusOf(deposit);
                      if (status === 'ready' || status === 'locked') setSheetOpen(true);
                      else setInfoOpen(true);
                    }}
                  />
                ))}
              </TransactionList>
            </TransactionMonthCard>

            {hasMore ? (
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="mx-auto rounded-full border border-black border-b-2 bg-white px-4 py-1.5 text-xs font-bold text-black transition active:translate-y-0.5 hover:bg-black/[0.03]"
              >
                {t('portfolio.list.showMore', 'Show more ({{count}})', {
                  count: positions.length - visibleCount,
                })}
              </button>
            ) : null}
          </>
        )}
      </WithHydrated>

      <PositionWithdrawSheet deposit={selected} open={sheetOpen} onOpenChange={() => setSheetOpen(false)} />

      <PositionInfoSheet deposit={selected} open={infoOpen} onOpenChange={() => setInfoOpen(false)} />

      <PortfolioFiltersModal
        open={filtersOpen}
        onOpenChange={() => setFiltersOpen(false)}
        filters={filters}
        onApply={setFilters}
        lockPeriods={lockPeriods}
      />
    </PageLayout>
  );
}

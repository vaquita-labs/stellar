'use client';

import { CircleIconButton } from '@/core-ui/components/molecules/CircleIconButton';
import {
  PageLayout,
  TransactionList,
  TransactionMonthCard,
  WithHydrated,
} from '@/core-ui/components/molecules';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { formatTimeDeposit } from '@/core-ui/helpers';
import { useDepositsComplete } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO } from '@/core-ui/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilter, FiX } from 'react-icons/fi';
import { PositionRow } from './PositionRow';
import { PositionWithdrawSheet } from './PositionWithdrawSheet';
import {
  EMPTY_PORTFOLIO_FILTERS,
  hasActivePortfolioFilters,
  PortfolioFilters,
  PortfolioFiltersModal,
} from './PortfolioFiltersModal';

/** Cuántas posiciones se muestran por tanda (para no renderizarlas todas). */
const PAGE_SIZE = 6;

/** Chip de un filtro aplicado, con × para quitarlo (igual que en /transactions). */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black border-b-2 bg-primary px-3 py-1 text-xs font-bold text-black">
      {label}
      <button type="button" onClick={onRemove} aria-label={label} className="text-black/60 hover:text-black">
        <FiX className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** "Ahora" real de un depósito, corrigiendo el reloj congelado del cache. */
const depositNow = (d: DepositResponseDTO) =>
  d.serverTimestamp && d.fetchedAtTimestamp
    ? d.serverTimestamp + (Date.now() - d.fetchedAtTimestamp)
    : Date.now();

const isReady = (d: DepositResponseDTO) => d.createdTimestamp + d.lockPeriod - depositNow(d) <= 0;

/**
 * Ruta `/portafolio`: lista las posiciones activas (depósitos con lock) para
 * elegir cuál retirar. Los filtros (plazo, estado, orden) viven en el modal del
 * embudo y se muestran como chips removibles arriba —igual que /transactions—:
 * si no hay nada seleccionado, no aparece ningún chip. Se puede aterrizar con
 * `?period=<segundos>` para llegar con ese plazo ya aplicado (así lo hace el
 * PortfolioPanel al tocar un plazo). El retiro devuelve la plata a las savings
 * (Blend) vía PositionWithdrawSheet.
 */
export function PortfolioPage({ onBack }: { onBack?: () => void } = {}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { walletAddress, token } = useConfigStore();
  const { data, isLoading } = useDepositsComplete(walletAddress);

  // Plazos ofrecidos por el token, de menor a mayor (para la sección "Term").
  const lockPeriods = useMemo(
    () => [...(token?.lockPeriods ?? [])].filter((p) => p > 0).sort((a, b) => a - b),
    [token?.lockPeriods],
  );

  const [selected, setSelected] = useState<DepositResponseDTO | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filtros (plazos + estado + fechas) del embudo, y paginación de la lista. Los
  // plazos arrancan con el `?period=` de la URL si matchea un plazo válido.
  const periodParam = Number(useSearchParams().get('period'));
  const [filters, setFilters] = useState<PortfolioFilters>(() => ({
    ...EMPTY_PORTFOLIO_FILTERS,
    periods: lockPeriods.includes(periodParam) ? [periodParam] : [],
  }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const positions = useMemo(() => {
    const { activeDeposits } = getDepositsData(data?.deposits ?? []);
    // Fin del día del "hasta" para incluir todo ese día.
    const endInclusive = filters.endDate !== null ? filters.endDate + 86_400_000 - 1 : null;
    return activeDeposits
      .filter((d) => filters.periods.length === 0 || filters.periods.includes(d.lockPeriod))
      .filter((d) => filters.status === 'all' || (filters.status === 'ready' ? isReady(d) : !isReady(d)))
      .filter((d) => filters.startDate === null || d.createdTimestamp >= filters.startDate)
      .filter((d) => endInclusive === null || d.createdTimestamp <= endInclusive)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  }, [data, filters]);

  // Chips de los filtros aplicados (con × para quitarlos). Si no hay filtros, no
  // se muestra ningún chip.
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  filters.periods.forEach((lp) =>
    chips.push({
      key: `period-${lp}`,
      label: formatTimeDeposit(lp),
      onRemove: () => setFilters((prev) => ({ ...prev, periods: prev.periods.filter((p) => p !== lp) })),
    }),
  );
  if (filters.status !== 'all') {
    chips.push({
      key: 'status',
      label: t(
        `portfolio.filters.statuses.${filters.status}`,
        filters.status === 'ready' ? 'Ready to withdraw' : 'Still locked',
      ),
      onRemove: () => setFilters((prev) => ({ ...prev, status: 'all' })),
    });
  }
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
          variant={hasActivePortfolioFilters(filters) ? 'primary' : 'white'}
          ariaLabel={t('transactions.filters.title', 'Filter')}
          onClick={() => setFiltersOpen(true)}
          icon={<FiFilter className="h-4 w-4" />}
        />
      }
    >
      <WithHydrated fallback={<div className="h-24" />}>
        {/* Chips de los filtros aplicados (con ×). Si no hay filtros, no aparece. */}
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
          <div className="flex flex-col items-center gap-2 rounded-lg border border-black border-b-2 bg-white px-4 py-10 text-center">
            <p className="text-sm font-semibold text-black">
              {t('portfolio.withdraw.empty', 'No positions to withdraw in this term.')}
            </p>
            <p className="text-xs text-gray-600">
              {t('portfolio.list.emptyHint', 'Your locked savings will show up here.')}
            </p>
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
                      setSheetOpen(true);
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

      <PositionWithdrawSheet
        deposit={selected}
        open={sheetOpen}
        onOpenChange={() => setSheetOpen(false)}
      />

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

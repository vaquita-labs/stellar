'use client';

import { Button } from '@/core-ui/components/atoms';
import { AppModal, DateField, DatePickerSheet, FilterCheckRow, startOfDay, toggleValue } from '@/core-ui/components/molecules';
import { formatTimeDeposit } from '@/core-ui/helpers';
import { DepositResponseDTO, DepositWithdrawalState } from '@/core-ui/types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type PositionStatusFilter = 'ready' | 'locked' | 'withdrawn' | 'failed';

export const POSITION_STATUSES: PositionStatusFilter[] = ['ready', 'locked', 'withdrawn', 'failed'];

export interface PortfolioFilters {
  /** Lock periods to show (checkboxes). Every period checked is the default; none checked shows nothing. */
  periods: number[];
  /** Statuses to show (checkboxes). Same rule as `periods`. */
  statuses: PositionStatusFilter[];
  startDate: number | null;
  endDate: number | null;
}

/** Every period and status checked, no date range: the list shows every position. */
export const defaultPortfolioFilters = (lockPeriods: number[]): PortfolioFilters => ({
  periods: lockPeriods,
  statuses: POSITION_STATUSES,
  startDate: null,
  endDate: null,
});

export const hasActivePortfolioFilters = (f: PortfolioFilters, lockPeriods: number[]): boolean =>
  f.periods.length < lockPeriods.length ||
  f.statuses.length < POSITION_STATUSES.length ||
  f.startDate !== null ||
  f.endDate !== null;

/** "Ahora" real de un depósito, corrigiendo el reloj congelado del cache. */
const depositNow = (d: DepositResponseDTO) =>
  d.serverTimestamp && d.fetchedAtTimestamp ? d.serverTimestamp + (Date.now() - d.fetchedAtTimestamp) : Date.now();

/** When the lock ends (ms). Past for anything already withdrawable. */
export const positionEndsAt = (d: DepositResponseDTO) => d.createdTimestamp + d.lockPeriod;

/**
 * Bucket a deposit falls into for the status filter. Deposits still being
 * processed have no bucket: they are not positions yet, so the list skips them.
 */
export const positionStatusOf = (d: DepositResponseDTO): PositionStatusFilter | null => {
  const S = DepositWithdrawalState;
  if (d.state === S.DEPOSIT_SUCCESS) return positionEndsAt(d) <= depositNow(d) ? 'ready' : 'locked';
  if (d.state === S.WITHDRAW_SUCCESS || d.state === S.WITHDRAW_SUCCESS_EARLY) return 'withdrawn';
  if (d.state === S.DEPOSIT_FAILED || d.state === S.WITHDRAW_FAILED) return 'failed';
  return null;
};

const STATUS_LABEL: Record<PositionStatusFilter, string> = {
  ready: 'Ready to withdraw',
  locked: 'Still locked',
  withdrawn: 'Withdrawn',
  failed: 'With error',
};

/** Translated label of a status (same text in the filter and in the chip). */
export const useStatusLabel = () => {
  const { t } = useTranslation();
  return (status: PositionStatusFilter): string => t(`portfolio.filters.statuses.${status}`, STATUS_LABEL[status]);
};

/**
 * Filtros de las posiciones del portafolio: rango de fechas + plazo + estado.
 * Plazo y estado son checkboxes: arrancan todos marcados y "Limpiar todo"
 * vuelve a ese default, o sea a ver todas las posiciones. Mismo estilo que
 * TransactionFiltersModal (reusa su DatePickerSheet).
 */
export function PortfolioFiltersModal({
  open,
  onOpenChange,
  filters,
  onApply,
  lockPeriods,
}: {
  open: boolean;
  onOpenChange: () => void;
  filters: PortfolioFilters;
  onApply: (filters: PortfolioFilters) => void;
  lockPeriods: number[];
}) {
  const { t } = useTranslation();
  const statusLabelOf = useStatusLabel();
  const [draft, setDraft] = useState(filters);
  const [picking, setPicking] = useState<'startDate' | 'endDate' | null>(null);
  const [pickerDate, setPickerDate] = useState(() => new Date());

  useEffect(() => {
    if (open) {
      setDraft(filters);
      setPicking(null);
    }
  }, [open, filters]);

  const today = startOfDay(new Date());
  const oldest = new Date(today.getFullYear() - 5, 0, 1);
  const pickerMin = picking === 'endDate' && draft.startDate !== null ? startOfDay(new Date(draft.startDate)) : oldest;
  const pickerMax = picking === 'startDate' && draft.endDate !== null ? startOfDay(new Date(draft.endDate)) : today;

  const openPicker = (field: 'startDate' | 'endDate') => {
    const min = field === 'endDate' && draft.startDate !== null ? startOfDay(new Date(draft.startDate)) : oldest;
    const max = field === 'startDate' && draft.endDate !== null ? startOfDay(new Date(draft.endDate)) : today;
    const current = startOfDay(new Date(draft[field] ?? Date.now()));
    setPickerDate(new Date(Math.min(Math.max(current.getTime(), min.getTime()), max.getTime())));
    setPicking(field);
  };

  const savePicker = () => {
    if (!picking) return;
    setDraft((prev) => ({ ...prev, [picking]: startOfDay(pickerDate).getTime() }));
    setPicking(null);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('transactions.filters.title', 'Filter')}
      size="md"
      fullScreen
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="white" className="flex-1" onPress={() => setDraft(defaultPortfolioFilters(lockPeriods))}>
            {t('transactions.filters.clearAll', 'Clear all')}
          </Button>
          <Button
            className="flex-1"
            onPress={() => {
              onApply(draft);
              onOpenChange();
            }}
          >
            {t('transactions.filters.apply', 'Apply')}
          </Button>
        </div>
      }
      overlay={
        <DatePickerSheet
          show={picking !== null}
          value={pickerDate}
          onChange={setPickerDate}
          min={pickerMin}
          max={pickerMax}
          onCancel={() => setPicking(null)}
          onSave={savePicker}
        />
      }
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <DateField
            label={t('transactions.filters.startDate', 'Start date')}
            value={draft.startDate}
            onPress={() => openPicker('startDate')}
            onClear={() => setDraft((prev) => ({ ...prev, startDate: null }))}
          />
          <DateField
            label={t('transactions.filters.endDate', 'End date')}
            value={draft.endDate}
            onPress={() => openPicker('endDate')}
            onClear={() => setDraft((prev) => ({ ...prev, endDate: null }))}
          />
        </div>

        <div className="space-y-1.5">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('portfolio.filters.term', 'Term')}
          </h3>
          <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-black border-b-2 bg-white">
            {lockPeriods.map((lp) => (
              <FilterCheckRow
                key={lp}
                label={formatTimeDeposit(lp)}
                checked={draft.periods.includes(lp)}
                onToggle={() => setDraft((prev) => ({ ...prev, periods: toggleValue(prev.periods, lp) }))}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('portfolio.filters.status', 'Status')}
          </h3>
          <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-black border-b-2 bg-white">
            {POSITION_STATUSES.map((status) => (
              <FilterCheckRow
                key={status}
                label={statusLabelOf(status)}
                checked={draft.statuses.includes(status)}
                onToggle={() => setDraft((prev) => ({ ...prev, statuses: toggleValue(prev.statuses, status) }))}
              />
            ))}
          </div>
        </div>
      </div>
    </AppModal>
  );
}

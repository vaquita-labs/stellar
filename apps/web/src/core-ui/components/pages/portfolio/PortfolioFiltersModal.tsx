'use client';

import { Button } from '@/core-ui/components/atoms';
import { AppModal, DateField, DatePickerSheet, startOfDay } from '@/core-ui/components/molecules';
import { formatTimeDeposit } from '@/core-ui/helpers';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck } from 'react-icons/fi';

export type PositionStatusFilter = 'all' | 'ready' | 'locked';

export interface PortfolioFilters {
  /** Plazos elegidos (multi-selección). Vacío = todos. */
  periods: number[];
  status: PositionStatusFilter;
  startDate: number | null;
  endDate: number | null;
}

export const EMPTY_PORTFOLIO_FILTERS: PortfolioFilters = {
  periods: [],
  status: 'all',
  startDate: null,
  endDate: null,
};

export const hasActivePortfolioFilters = (f: PortfolioFilters): boolean =>
  f.periods.length > 0 || f.status !== 'all' || f.startDate !== null || f.endDate !== null;

const STATUSES: PositionStatusFilter[] = ['all', 'ready', 'locked'];
const STATUS_LABEL: Record<PositionStatusFilter, string> = {
  all: 'All',
  ready: 'Ready to withdraw',
  locked: 'Still locked',
};

/** Fila con radio (selección única), estilo del filtro de transactions. */
function RadioRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FFF7E6]"
    >
      <span className="text-sm font-semibold text-black">{label}</span>
      <span
        className={
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-black ' +
          (selected ? 'bg-primary' : 'bg-white')
        }
      >
        {selected && <span className="h-2 w-2 rounded-full bg-black" />}
      </span>
    </button>
  );
}

/** Fila con checkbox (multi-selección) para los plazos. */
function CheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FFF7E6]"
    >
      <span className="text-sm font-semibold text-black">{label}</span>
      <span
        className={
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-black ' +
          (checked ? 'bg-primary' : 'bg-white')
        }
      >
        {checked && <FiCheck className="h-3.5 w-3.5 text-black" strokeWidth={3} />}
      </span>
    </button>
  );
}

/**
 * Filtros de las posiciones del portafolio: rango de fechas + plazo
 * (multi-selección) + estado. Mismo estilo que TransactionFiltersModal (reusa su
 * DatePickerSheet). El plazo se puede elegir de a varios: vacío = todos.
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

  const togglePeriod = (lp: number) =>
    setDraft((prev) => ({
      ...prev,
      periods: prev.periods.includes(lp) ? prev.periods.filter((p) => p !== lp) : [...prev.periods, lp],
    }));

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('transactions.filters.title', 'Filter')}
      size="md"
      fullScreen
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="white" className="flex-1" onPress={() => setDraft(EMPTY_PORTFOLIO_FILTERS)}>
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
              <CheckRow
                key={lp}
                label={formatTimeDeposit(lp)}
                checked={draft.periods.includes(lp)}
                onToggle={() => togglePeriod(lp)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('portfolio.filters.status', 'Status')}
          </h3>
          <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-black border-b-2 bg-white">
            {STATUSES.map((status) => (
              <RadioRow
                key={status}
                label={t(`portfolio.filters.statuses.${status}`, STATUS_LABEL[status])}
                selected={draft.status === status}
                onPress={() => setDraft((prev) => ({ ...prev, status }))}
              />
            ))}
          </div>
        </div>
      </div>
    </AppModal>
  );
}

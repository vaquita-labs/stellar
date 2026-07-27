'use client';

import { Button } from '@/core-ui/components/atoms';
import { AppModal, DateField, DatePickerSheet, startOfDay } from '@/core-ui/components/molecules';
import {
  EMPTY_TRANSACTION_FILTERS,
  TransactionFilters,
  TransactionKindFilter,
  TransactionStatusFilter,
} from '@/core-ui/helpers/transactions';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
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

const KINDS: TransactionKindFilter[] = ['all', 'deposit', 'withdraw'];
const STATUSES: TransactionStatusFilter[] = ['all', 'completed', 'pending', 'failed'];

/**
 * Filtros del historial: rango de fechas + tipo + estado, a pantalla completa.
 * El selector de fecha es una hoja DENTRO del mismo diálogo (prop `overlay` de
 * AppModal, ver DatePickerSheet): así los filtros siguen visibles detrás en vez
 * de desaparecer, y no se apilan dos overlays de React Aria.
 */
export function TransactionFiltersModal({
  open,
  onOpenChange,
  filters,
  onApply,
}: {
  open: boolean;
  onOpenChange: () => void;
  filters: TransactionFilters;
  onApply: (filters: TransactionFilters) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(filters);
  const [picking, setPicking] = useState<'startDate' | 'endDate' | null>(null);
  const [pickerDate, setPickerDate] = useState(() => new Date());

  // Al reabrir, el borrador parte de los filtros aplicados.
  useEffect(() => {
    if (open) {
      setDraft(filters);
      setPicking(null);
    }
  }, [open, filters]);

  // Rango elegible: nunca a futuro y nunca cruzado (el "hasta" no puede ser
  // anterior al "desde" ni al revés).
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
    const picked = startOfDay(pickerDate);
    setDraft((prev) => ({ ...prev, [picking]: picked.getTime() }));
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
          <Button variant="white" className="flex-1" onPress={() => setDraft(EMPTY_TRANSACTION_FILTERS)}>
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
            {t('transactions.filters.type', 'Transaction type')}
          </h3>
          <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-black border-b-2 bg-white">
            {KINDS.map((kind) => (
              <OptionRow
                key={kind}
                label={t(`transactions.filters.kinds.${kind}`)}
                selected={draft.kind === kind}
                onPress={() => setDraft((prev) => ({ ...prev, kind }))}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('transactions.filters.status', 'Status')}
          </h3>
          <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-black border-b-2 bg-white">
            {STATUSES.map((status) => (
              <OptionRow
                key={status}
                label={t(`transactions.filters.statuses.${status}`)}
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

'use client';

import { Button } from '@/core-ui/components/atoms';
import { AppModal, DateField, DatePickerSheet, FilterCheckRow, startOfDay, toggleValue } from '@/core-ui/components/molecules';
import {
  DEFAULT_TRANSACTION_FILTERS,
  TRANSACTION_KINDS,
  TRANSACTION_STATUSES,
  TransactionFilters,
} from '@/core-ui/helpers/transactions';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Filtros del historial: rango de fechas + tipo + estado, a pantalla completa.
 * Tipo y estado son checkboxes: arrancan todos marcados y "Limpiar todo" vuelve
 * a ese default, o sea a ver todo. El selector de fecha es una hoja DENTRO del
 * mismo diálogo (prop `overlay` de AppModal, ver DatePickerSheet): así los
 * filtros siguen visibles detrás en vez de desaparecer, y no se apilan dos
 * overlays de React Aria.
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
          <Button variant="white" className="flex-1" onPress={() => setDraft(DEFAULT_TRANSACTION_FILTERS)}>
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
            {TRANSACTION_KINDS.map((kind) => (
              <FilterCheckRow
                key={kind}
                label={t(`transactions.filters.kinds.${kind}`)}
                checked={draft.kinds.includes(kind)}
                onToggle={() => setDraft((prev) => ({ ...prev, kinds: toggleValue(prev.kinds, kind) }))}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('transactions.filters.status', 'Status')}
          </h3>
          <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-black border-b-2 bg-white">
            {TRANSACTION_STATUSES.map((status) => (
              <FilterCheckRow
                key={status}
                label={t(`transactions.filters.statuses.${status}`)}
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

'use client';

import { Button } from '@/core-ui/components/atoms';
import { AppModal } from '@/core-ui/components/molecules';
import {
  EMPTY_TRANSACTION_FILTERS,
  TransactionFilters,
  TransactionKindFilter,
  TransactionStatusFilter,
} from '@/core-ui/helpers/transactions';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCalendar, FiX } from 'react-icons/fi';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PAD = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Columna del selector de fecha tipo rueda: la opción centrada es la
 * seleccionada. Se apoya en scroll-snap nativo (sin librerías) y reporta el
 * índice al frenar el scroll.
 */
function WheelColumn({
  items,
  index,
  onChange,
  ariaLabel,
}: {
  items: string[];
  index: number;
  onChange: (index: number) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Índice pedido desde afuera (ej. al recortar el día por cambio de mes):
  // reposiciona el scroll salvo que el cambio venga del propio scroll.
  const selfScrollRef = useRef(false);

  useEffect(() => {
    if (selfScrollRef.current) {
      selfScrollRef.current = false;
      return;
    }
    ref.current?.scrollTo({ top: index * ITEM_HEIGHT });
  }, [index]);

  const handleScroll = () => {
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const element = ref.current;
      if (!element) return;
      const next = Math.max(0, Math.min(items.length - 1, Math.round(element.scrollTop / ITEM_HEIGHT)));
      if (next !== index) {
        selfScrollRef.current = true;
        onChange(next);
      }
    }, 120);
  };

  useEffect(() => () => { if (settleRef.current) clearTimeout(settleRef.current); }, []);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      onScroll={handleScroll}
      className="no-scrollbar flex-1 overflow-y-auto snap-y snap-mandatory"
      style={{ height: WHEEL_HEIGHT }}
    >
      <div style={{ height: PAD }} />
      {items.map((item, i) => (
        <div
          key={item}
          role="option"
          aria-selected={i === index}
          onClick={() => onChange(i)}
          className={
            'flex snap-center items-center justify-center text-base transition-colors cursor-pointer ' +
            (i === index ? 'font-bold text-black' : 'text-gray-400')
          }
          style={{ height: ITEM_HEIGHT }}
        >
          {item}
        </div>
      ))}
      <div style={{ height: PAD }} />
    </div>
  );
}

function DateWheel({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  const { i18n } = useTranslation();
  const currentYear = new Date().getFullYear();
  const years = range(currentYear - 5, currentYear + 1);
  const months = range(0, 11).map((m) =>
    new Date(2000, m, 1).toLocaleDateString(i18n.language, { month: 'long' }),
  );
  const days = range(1, daysInMonth(value.getFullYear(), value.getMonth())).map(String);

  const setPart = (part: 'day' | 'month' | 'year', index: number) => {
    const year = part === 'year' ? years[index] : value.getFullYear();
    const month = part === 'month' ? index : value.getMonth();
    const day = part === 'day' ? index + 1 : value.getDate();
    // Al pasar a un mes más corto el día se recorta en vez de saltar de mes.
    onChange(new Date(year, month, Math.min(day, daysInMonth(year, month))));
  };

  return (
    <div className="relative">
      {/* Banda de selección: marca la fila centrada (la seleccionada). */}
      <div
        className="pointer-events-none absolute inset-x-0 rounded-md border border-black border-b-2 bg-primary/15"
        style={{ top: PAD, height: ITEM_HEIGHT }}
      />
      <div className="flex gap-2">
        <WheelColumn items={days} index={value.getDate() - 1} onChange={(i) => setPart('day', i)} ariaLabel="day" />
        <WheelColumn items={months} index={value.getMonth()} onChange={(i) => setPart('month', i)} ariaLabel="month" />
        <WheelColumn
          items={years.map(String)}
          index={Math.max(0, years.indexOf(value.getFullYear()))}
          onChange={(i) => setPart('year', i)}
          ariaLabel="year"
        />
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onPress,
  onClear,
}: {
  label: string;
  value: number | null;
  onPress: () => void;
  onClear: () => void;
}) {
  const { i18n } = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-black border-b-2 bg-white px-3 h-12">
      <button type="button" onClick={onPress} className="flex flex-1 items-center gap-2 text-left min-w-0">
        <span className={'flex-1 truncate text-sm font-semibold ' + (value ? 'text-black' : 'text-gray-400')}>
          {value ? new Date(value).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : label}
        </span>
        <FiCalendar className="h-4 w-4 shrink-0 text-gray-500" />
      </button>
      {value !== null && (
        <button type="button" onClick={onClear} aria-label={label} className="text-gray-500 hover:text-black">
          <FiX className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
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
 * Filtros del historial: rango de fechas + tipo + estado. El selector de fecha
 * se pinta dentro del MISMO modal (con flecha atrás), igual que el detalle de
 * la vaquita en Bank Rewards, para no apilar overlays.
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

  const openPicker = (field: 'startDate' | 'endDate') => {
    setPickerDate(new Date(draft[field] ?? Date.now()));
    setPicking(field);
  };

  const savePicker = () => {
    if (!picking) return;
    const picked = new Date(pickerDate);
    picked.setHours(0, 0, 0, 0);
    setDraft((prev) => ({ ...prev, [picking]: picked.getTime() }));
    setPicking(null);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={picking ? t('transactions.filters.selectDate', 'Select date') : t('transactions.filters.title', 'Filter')}
      onBack={picking ? () => setPicking(null) : undefined}
      size="md"
      footer={
        picking ? (
          <div className="flex gap-2 w-full">
            <Button variant="white" className="flex-1" onPress={() => setPicking(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button className="flex-1" onPress={savePicker}>
              {t('common.save', 'Save')}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 w-full">
            <Button
              variant="white"
              className="flex-1"
              onPress={() => setDraft(EMPTY_TRANSACTION_FILTERS)}
            >
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
        )
      }
    >
      {picking ? (
        <DateWheel value={pickerDate} onChange={setPickerDate} />
      ) : (
        <div className="space-y-4">
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

          <div className="space-y-2">
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

          <div className="space-y-2">
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
      )}
    </AppModal>
  );
}

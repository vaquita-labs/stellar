'use client';

import { Button } from '@/core-ui/components/atoms';
import { AppModal } from '@/core-ui/components/molecules';
import {
  EMPTY_TRANSACTION_FILTERS,
  TransactionFilters,
  TransactionKindFilter,
  TransactionStatusFilter,
} from '@/core-ui/helpers/transactions';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCalendar, FiX } from 'react-icons/fi';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PAD = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

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

  useEffect(
    () => () => {
      if (settleRef.current) clearTimeout(settleRef.current);
    },
    [],
  );

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

function DateWheel({
  value,
  onChange,
  min,
  max,
}: {
  value: Date;
  onChange: (date: Date) => void;
  min: Date;
  max: Date;
}) {
  const { i18n } = useTranslation();

  // Cada columna solo lista lo que se puede elegir dado el resto de la fecha:
  // en el año del tope no aparecen los meses posteriores, y en ese mes no
  // aparecen los días posteriores (ídem hacia atrás con el mínimo). Así el
  // límite se ve, en vez de que la rueda rebote sola.
  const years = range(min.getFullYear(), max.getFullYear());
  const monthFrom = value.getFullYear() === min.getFullYear() ? min.getMonth() : 0;
  const monthTo = value.getFullYear() === max.getFullYear() ? max.getMonth() : 11;
  const monthValues = range(monthFrom, monthTo);
  const inMinMonth = value.getFullYear() === min.getFullYear() && value.getMonth() === min.getMonth();
  const inMaxMonth = value.getFullYear() === max.getFullYear() && value.getMonth() === max.getMonth();
  const dayFrom = inMinMonth ? min.getDate() : 1;
  const dayTo = inMaxMonth ? max.getDate() : daysInMonth(value.getFullYear(), value.getMonth());
  const dayValues = range(dayFrom, dayTo);

  const months = monthValues.map((m) => new Date(2000, m, 1).toLocaleDateString(i18n.language, { month: 'long' }));
  const days = dayValues.map(String);

  const setPart = (part: 'day' | 'month' | 'year', index: number) => {
    const year = part === 'year' ? years[index] : value.getFullYear();
    const month = part === 'month' ? monthValues[index] : value.getMonth();
    const day = part === 'day' ? dayValues[index] : value.getDate();
    // Al pasar a un mes más corto el día se recorta en vez de saltar de mes.
    const next = new Date(year, month, Math.min(day, daysInMonth(year, month)));
    // Cambiar de año o mes puede dejar el resto fuera de rango (ej. pasar al
    // año del tope con un mes posterior): se acota al límite y las columnas se
    // recalculan con el valor ya válido.
    onChange(new Date(Math.min(Math.max(next.getTime(), min.getTime()), max.getTime())));
  };

  return (
    <div className="relative">
      {/* Banda de selección: marca la fila centrada (la seleccionada). */}
      <div
        className="pointer-events-none absolute inset-x-0 rounded-md border border-black border-b-2 bg-primary/15"
        style={{ top: PAD, height: ITEM_HEIGHT }}
      />
      <div className="flex gap-2">
        <WheelColumn
          items={days}
          index={Math.max(0, value.getDate() - dayFrom)}
          onChange={(i) => setPart('day', i)}
          ariaLabel="day"
        />
        <WheelColumn
          items={months}
          index={Math.max(0, value.getMonth() - monthFrom)}
          onChange={(i) => setPart('month', i)}
          ariaLabel="month"
        />
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
          {value
            ? new Date(value).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
            : label}
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
 * AppModal): así los filtros siguen visibles detrás en vez de desaparecer, y no
 * se apilan dos overlays de React Aria.
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
        <AnimatePresence>
          {picking && (
            <>
              <motion.div
                key="date-dim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 z-10 bg-black/40"
                onClick={() => setPicking(null)}
              />
              <motion.div
                key="date-sheet"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.25 }}
                className="absolute inset-x-0 bottom-0 z-20 space-y-3 rounded-t-2xl border-t border-black bg-background px-4 pt-4 pb-5"
              >
                <h2 className="text-lg font-bold text-black">{t('transactions.filters.selectDate', 'Select date')}</h2>
                <DateWheel value={pickerDate} onChange={setPickerDate} min={pickerMin} max={pickerMax} />
                <div className="flex gap-2">
                  <Button variant="white" className="flex-1" onPress={() => setPicking(null)}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button className="flex-1" onPress={savePicker}>
                    {t('common.save', 'Save')}
                  </Button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
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

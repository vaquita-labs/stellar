'use client';

import { Button } from '@/core-ui/components/atoms';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCalendar, FiX } from 'react-icons/fi';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PAD = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Columna del selector de fecha tipo rueda: la opción centrada es la
 * seleccionada. Se apoya en scroll-snap nativo (sin librerías) y reporta el
 * índice al frenar el scroll. Extraído de /transactions para compartirlo.
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

export function DateWheel({
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
    const next = new Date(year, month, Math.min(day, daysInMonth(year, month)));
    onChange(new Date(Math.min(Math.max(next.getTime(), min.getTime()), max.getTime())));
  };

  return (
    <div className="relative">
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

export function DateField({
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

/**
 * Hoja inferior con la rueda de fecha + Cancelar/Guardar. Se renderiza dentro del
 * `overlay` del AppModal del filtro (así los filtros quedan detrás en vez de
 * desaparecer). `show` la monta/desmonta con animación.
 */
export function DatePickerSheet({
  show,
  value,
  onChange,
  min,
  max,
  onCancel,
  onSave,
}: {
  show: boolean;
  value: Date;
  onChange: (date: Date) => void;
  min: Date;
  max: Date;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            key="date-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-10 bg-black/40"
            onClick={onCancel}
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
            <DateWheel value={value} onChange={onChange} min={min} max={max} />
            <div className="flex gap-2">
              <Button variant="white" className="flex-1" onPress={onCancel}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button className="flex-1" onPress={onSave}>
                {t('common.save', 'Save')}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

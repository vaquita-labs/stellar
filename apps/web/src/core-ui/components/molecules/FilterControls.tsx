'use client';

import { FiCheck, FiX } from 'react-icons/fi';

/** Chip of an applied filter, with × to drop it (transactions and portfolio lists). */
export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black border-b-2 bg-primary px-3 py-1 text-xs font-bold text-black">
      {label}
      <button type="button" onClick={onRemove} aria-label={label} className="text-black/60 hover:text-black">
        <FiX className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** Checkbox row of a multi-select section inside a filters modal. */
export function FilterCheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
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

/** Adds or removes `value` from a multi-select filter. */
export const toggleValue = <T,>(values: T[], value: T): T[] =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

/**
 * Chips for a multi-select filter. All options checked is the default and shows
 * no chip; otherwise one chip per checked option. Dropping the last chip goes
 * back to every option, since a list that shows nothing is never what a × means.
 */
export const multiSelectChips = <T,>(
  selected: T[],
  options: T[],
  label: (value: T) => string,
  onChange: (next: T[]) => void,
): { key: string; label: string; onRemove: () => void }[] =>
  selected.length >= options.length
    ? []
    : selected.map((value) => ({
        key: String(value),
        label: label(value),
        onRemove: () => {
          const next = selected.filter((v) => v !== value);
          onChange(next.length === 0 ? options : next);
        },
      }));

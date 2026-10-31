'use client';

import { type PollarLanguage, type RampField, rampFieldError } from '@pollar/core';

/** The look of every text input in the fiat sheets, so they do not drift apart. */
export const RAMP_FIELD_CLASS =
  'w-full rounded-md border border-black border-b-2 bg-white h-11 px-3 text-sm text-black placeholder:text-gray-400 outline-none focus:border-b-3 disabled:opacity-60';

/** The placeholder to show: the one a sibling select dictates, else the static one. */
function placeholderFor(field: RampField, fields: RampField[], values: Record<string, string>): string | undefined {
  if (field.placeholderFrom) {
    const source = fields.find((f) => f.key === field.placeholderFrom);
    const chosen = source?.options?.find((o) => o.value === values[field.placeholderFrom as string]);
    if (chosen?.placeholder) return chosen.placeholder;
  }
  return field.placeholder;
}

interface RampQuoteFieldsProps {
  fields: RampField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  language: PollarLanguage;
  disabled?: boolean;
  /** What a missing or wrong value says; the SDK phrases it per field. */
  selectPlaceholder: string;
  optionalLabel: string;
}

/**
 * The details a route asks for before it starts, as the quote describes them.
 * Nothing here is wired to a country: the keys, labels, types, options and
 * examples all come from the quote, so a new corridor does not touch this file.
 */
export function RampQuoteFields({
  fields,
  values,
  onChange,
  language,
  disabled,
  selectPlaceholder,
  optionalLabel,
}: RampQuoteFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => {
        const id = `pollar-buy-${field.key}`;
        const error = values[field.key] ? rampFieldError(field, values[field.key], language) : null;
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500" htmlFor={id}>
              {field.label}
              {field.optional && <span className="font-normal text-gray-400"> ({optionalLabel})</span>}
            </label>
            {field.type === 'select' ? (
              <select
                id={id}
                value={values[field.key] ?? ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                disabled={disabled}
                className={RAMP_FIELD_CLASS}
              >
                <option value="" disabled={!field.optional}>
                  {selectPlaceholder}
                </option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={field.type}
                value={values[field.key] ?? ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                disabled={disabled}
                placeholder={placeholderFor(field, fields, values)}
                autoComplete={field.type === 'email' ? 'email' : 'off'}
                className={RAMP_FIELD_CLASS}
              />
            )}
            {error ? (
              <p className="text-[11px] font-medium text-red-600">{error}</p>
            ) : field.hint ? (
              <p className="text-[11px] text-gray-400">{field.hint}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

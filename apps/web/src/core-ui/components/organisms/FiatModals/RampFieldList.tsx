'use client';

import { placeholderFor, type RampField } from '@/networks/pollar/rampFields';

/** Estilo de todos los inputs de los modales de fiat, para que no deriven. */
export const RAMP_FIELD_CLASS =
  'w-full rounded-md border border-black border-b-2 bg-white h-11 px-3 text-sm text-black placeholder:text-gray-400 outline-none focus:border-b-3 disabled:opacity-60';

interface RampFieldListProps {
  fields: RampField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  /** Prefijo de los `id`, para que dos formularios no colisionen. */
  idPrefix?: string;
}

/**
 * Los datos que pide el proveedor, tal como los describe la cotización.
 *
 * Nada acá está cableado a un país: qué campos hay, cómo se llaman, qué tipo
 * son, qué opciones tiene un select y qué ejemplo mostrar lo decide la respuesta
 * de `/ramps/quote`. Por eso el mismo componente sirve para comprar y para
 * vender, y sumar un corredor no toca este archivo.
 */
export function RampFieldList({ fields, values, onChange, disabled, idPrefix = 'ramp' }: RampFieldListProps) {
  return (
    <>
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500" htmlFor={`${idPrefix}-${field.key}`}>
            {field.label}
          </label>
          {field.type === 'select' ? (
            <select
              id={`${idPrefix}-${field.key}`}
              value={values[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={disabled}
              className={RAMP_FIELD_CLASS}
            >
              <option value="">{field.placeholder ?? field.label}</option>
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${idPrefix}-${field.key}`}
              type={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
              value={values[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={disabled}
              placeholder={placeholderFor(field, fields, values)}
              className={RAMP_FIELD_CLASS}
            />
          )}
          {field.hint && <p className="text-[11px] text-gray-400">{field.hint}</p>}
        </div>
      ))}
    </>
  );
}

'use client';

import { FiDelete } from 'react-icons/fi';

interface AmountKeypadProps {
  /** Monto crudo tal como lo tecleó el usuario ('' = vacío, se muestra como 0). */
  value: string;
  onValueChange: (next: string) => void;
  /** Decimales permitidos. USDC son 6 on-chain, pero al teclear en USD son 2. */
  maxDecimals?: number;
  /** Tope duro: teclas que lo superarían se ignoran (no se recorta el valor). */
  max?: number;
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

/**
 * Teclado numérico in-app para montos. A diferencia de `MoneyInput` (que es un
 * <input> y depende del teclado nativo del OS), acá el usuario nunca ve el
 * teclado del sistema: el sheet no se reacomoda ni tapa el CTA en mobile.
 *
 * Solo maneja el string del monto; la validación de negocio (mínimo, saldo
 * disponible) vive en el consumidor, que es quien sabe contra qué comparar.
 */
export function AmountKeypad({
  value,
  onValueChange,
  maxDecimals = 2,
  max,
  disabled = false,
}: AmountKeypadProps) {
  const press = (key: (typeof KEYS)[number]) => {
    if (disabled) return;

    if (key === 'del') {
      onValueChange(value.slice(0, -1));
      return;
    }

    if (key === '.') {
      // Un solo punto, y nunca como primer carácter ('.5' → '0.5').
      if (value.includes('.')) return;
      onValueChange(value === '' ? '0.' : value + '.');
      return;
    }

    // Sin ceros a la izquierda: '0' + '5' es '5', no '05'.
    const next = value === '0' ? key : value + key;

    const [, decimals = ''] = next.split('.');
    if (decimals.length > maxDecimals) return;
    if (max !== undefined && Number(next) > max) return;

    onValueChange(next);
  };

  return (
    <div className="grid grid-cols-3 gap-1">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => press(key)}
          aria-label={key === 'del' ? 'delete' : key}
          className="flex items-center justify-center h-14 rounded-lg text-2xl font-bold text-black transition active:translate-y-0.5 hover:bg-black/5 disabled:opacity-40 disabled:pointer-events-none"
        >
          {key === 'del' ? <FiDelete className="w-6 h-6" /> : key}
        </button>
      ))}
    </div>
  );
}

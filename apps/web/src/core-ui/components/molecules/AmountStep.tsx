'use client';

import { useAnimationControls } from 'framer-motion';
import { ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUsdPrecise, truncatedAmountString } from '@/core-ui/helpers/numbers';
import { AmountDisplay } from './AmountDisplay';
import { AmountKeypad } from './AmountKeypad';

type AmountControls = ReturnType<typeof useAnimationControls>;

/**
 * El temblor del número cuando el monto no entra. Vive acá y no en cada pantalla
 * porque los keyframes son parte de "cómo se siente equivocarse" en esta app, y
 * cuatro copias distintas se desincronizan a la primera que alguien retoca.
 *
 * El disparo queda en el consumidor —`shake()` se llama desde su validación, que
 * es quien sabe contra qué compara— y `controls` se le pasa al `AmountStep`.
 */
export function useAmountShake() {
  const controls = useAnimationControls();
  const shake = useCallback(() => {
    void controls.start({
      x: [0, -8, 8, -6, 6, -3, 3, 0],
      transition: { duration: 0.45, ease: 'easeInOut' },
    });
  }, [controls]);
  return { controls, shake };
}

interface AmountStepProps {
  /** Monto crudo tecleado ('' = vacío, se muestra como 0). */
  value: string;
  onValueChange: (next: string) => void;
  /** Decimales que acepta el teclado: `AMOUNT_DECIMALS` en cripto, 2 en fiat. */
  decimals: number;
  /** '$' para dólares, 'Bs' para bolivianos, '' para el número pelado. */
  symbol?: string;
  symbolPosition?: 'prefix' | 'suffix';
  disabled?: boolean;
  /** Tope duro del teclado: las teclas que lo superarían no responden. */
  max?: number;

  /**
   * Problema del monto, en rojo. Se limpia solo en la próxima tecla: lo dijo un
   * monto que ya no es el que está en pantalla.
   */
  error?: string | null;
  onErrorClear?: () => void;
  /**
   * Qué dice la línea cuando NO hay error: el mínimo, o los límites de la ruta.
   * Conviene que siempre haya algo — la línea es la misma que usa el error, así
   * que si está siempre ocupada la pantalla no salta al fallar la validación.
   */
  hint?: ReactNode;

  /**
   * Montos sugeridos en chips (el depósito ofrece 10 y 20). Teclean el valor
   * como si el usuario lo hubiera escrito, así que después se puede seguir
   * editando con el teclado; no son opciones excluyentes.
   */
  presets?: number[];

  /** Saldo disponible: dibuja el chip que teclea el máximo. `null` = sin chip. */
  available?: number | null;
  /**
   * Decimales del chip de saldo: los que muestra y los que teclea. Por defecto,
   * los del teclado.
   *
   * El retiro lo baja a 2: el saldo trae los 7 de USDC y nadie los lee, y ahí
   * recortar no deja plata atrás porque tocar el chip retira TODO sin mirar el
   * número. Una pantalla que necesite mover el saldo exacto —la migración de
   * Blend, que no se cierra hasta que la posición queda en cero— no lo toca.
   */
  availableDecimals?: number;
  availableLoading?: boolean;
  /** Aviso de que se tecleó el máximo, para los flujos que retiran "todo". */
  onMax?: (prefilled: string) => void;

  /** De `useAmountShake()`. */
  controls?: AmountControls;

  /**
   * Lo que va ENTRE el número y el teclado. El teclado no siempre está pegado al
   * monto: el retiro mete el destino en el medio y la compra mete la cotización,
   * que es justo lo que cambia mientras se teclea.
   */
  children?: ReactNode;
}

/**
 * La pantalla de monto de todos los flujos de plata.
 *
 * El orden es siempre el mismo —número grande, chip de saldo, una línea, el
 * teclado— y la línea hace doble función: muestra el problema si lo hay y el
 * mínimo si no. Que sea UNA sola línea es el punto: si el error se sumara abajo
 * del mínimo, la pantalla se movería justo cuando el usuario está mirando el
 * número, y en mobile eso corre el teclado bajo el dedo.
 */
export function AmountStep({
  value,
  onValueChange,
  decimals,
  symbol = '$',
  symbolPosition = 'prefix',
  disabled = false,
  max,
  error,
  onErrorClear,
  hint,
  presets,
  available,
  availableDecimals,
  availableLoading = false,
  onMax,
  controls,
  children,
}: AmountStepProps) {
  const { t } = useTranslation();

  const change = (next: string) => {
    onValueChange(next);
    if (error) onErrorClear?.();
  };

  const chipDecimals = availableDecimals ?? decimals;

  const fillMax = () => {
    if (available == null) return;
    // Siempre por `truncatedAmountString`: `String(saldo)` deja colgando el ruido
    // del float (10.4699999) y el usuario lo ve tecleado como si lo hubiera
    // escrito él.
    const prefilled = truncatedAmountString(available, chipDecimals);
    onValueChange(prefilled);
    if (error) onErrorClear?.();
    onMax?.(prefilled);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-center">
        <AmountDisplay
          value={value}
          symbol={symbol}
          symbolPosition={symbolPosition}
          muted={value === '' || !!error}
          controls={controls}
        />

        {available != null && (
          <button
            type="button"
            onClick={fillMax}
            disabled={disabled || availableLoading}
            className="mt-1 inline-flex items-center rounded-full border border-black/15 bg-black/5 px-3 py-1 text-xs font-semibold text-gray-500 transition active:translate-y-0.5 hover:bg-black/10 disabled:opacity-60"
          >
            {availableLoading ? (
              <span className="h-3 w-20 rounded bg-black/10 animate-pulse" />
            ) : (
              `${t('withdraw.available', 'Available')}: ${formatUsdPrecise(available, chipDecimals)}`
            )}
          </button>
        )}

        {(error || hint) && (
          <p className={`mt-1 text-xs ${error ? 'font-medium text-red-600' : 'text-gray-400'}`}>{error || hint}</p>
        )}
      </div>

      {presets && presets.length > 0 && (
        <div className="flex justify-center gap-2">
          {presets.map((preset) => {
            // Comparamos contra el string que teclearía el chip, no contra el
            // número: '10' y '10.' son el mismo monto pero el segundo es alguien
            // que ya empezó a escribir otra cosa.
            const prefilled = truncatedAmountString(preset, decimals);
            return (
              <button
                key={preset}
                type="button"
                disabled={disabled}
                onClick={() => change(prefilled)}
                className={
                  'flex-1 rounded-lg border border-black/15 py-1.5 text-sm font-semibold text-gray-600 transition active:translate-y-0.5 hover:bg-black/10 disabled:opacity-60 ' +
                  (value === prefilled ? 'bg-black/10' : 'bg-black/5')
                }
              >
                {symbolPosition === 'prefix' ? `${symbol}${prefilled}` : `${prefilled} ${symbol}`}
              </button>
            );
          })}
        </div>
      )}

      {children}

      <AmountKeypad value={value} onValueChange={change} maxDecimals={decimals} max={max} disabled={disabled} />
    </div>
  );
}

/**
 * Alto fijo de la fila de destino que va entre el número y el teclado (la wallet
 * del retiro, la cuenta bancaria del corredor, el plazo de la inversión).
 *
 * Sin esto la fila mide lo que mida su contenido, y los estados de una misma
 * pantalla no coinciden entre sí: "Elegí una cuenta bancaria" ocupa un renglón y
 * la cuenta ya elegida ocupa dos, así que el teclado salta hacia abajo al elegir
 * —con el pulgar encima— y las pantallas de retiro no arrancan todas a la misma
 * altura. Es el alto de la fila de dos renglones, que es la que manda.
 */
export const DESTINATION_ROW = 'min-h-16';

export type { AmountControls };

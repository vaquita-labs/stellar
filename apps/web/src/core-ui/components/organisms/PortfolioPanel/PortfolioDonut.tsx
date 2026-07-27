'use client';

import { ReactNode, useEffect, useState } from 'react';

export interface DonutSegment {
  key: string;
  /** Color crudo del arco (hex). */
  color: string;
  /** Monto de este segmento; el arco es proporcional a su parte del total. */
  value: number;
}

interface PortfolioDonutProps {
  /**
   * Segmentos en orden ESTABLE (no por monto): así, al invertir/retirar, cada
   * arco crece o se encoge en su lugar en vez de saltar de posición. Se pasan
   * todos (incluidos los de monto 0) para que un segmento nuevo anime desde 0.
   */
  segments: DonutSegment[];
  /** Suma de los segmentos; define la escala. Si es 0 se pinta solo la pista. */
  total: number;
  /** Etiqueta chica sobre el número (ej. "Total"). */
  label: string;
  /** Número ya formateado que va al centro (ej. "$722.01" o con centavos en alto). */
  amount: ReactNode;
  /** Atenúa el centro mientras se re-sincroniza tras un invest/retiro. */
  syncing?: boolean;
}

const SIZE = 184;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * Anillo de distribución con el total al centro. Cada opción con fondos es un arco
 * de su color, del tamaño de su parte del total: la barra de distribución de antes
 * pero en círculo. Los arcos arrancan arriba (12 h) y van en sentido horario, con
 * una pequeña separación entre sí.
 *
 * Todo se anima con transición de CSS sobre el `stroke-dasharray/offset`: al montar
 * los arcos se "dibujan" desde 0, y al cambiar los montos (invertir/retirar) crecen
 * o se encogen suave, sin saltar. Es solo presentación; datos e interacción viven
 * en la lista de abajo.
 */
export function PortfolioDonut({ segments, total, label, amount, syncing }: PortfolioDonutProps) {
  // Dibujado al montar: primer frame en 0, luego a los valores reales → la
  // transición de CSS anima el trazo hacia adelante.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const fundedCount = segments.filter((s) => s.value > 0).length;
  // Separación entre arcos (en unidades de circunferencia). Sin separación si hay
  // un solo segmento (anillo lleno) para que no quede un corte suelto.
  const gap = fundedCount > 1 ? 7 : 0;

  let offset = 0;

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block">
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {/* Pista de fondo: el aro completo, tenue. */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-black/[0.06]"
          />
          {segments.map((s) => {
            const arc = total > 0 ? (s.value / total) * C : 0;
            // El arco visible (con separación). En el primer frame (o sin fondos)
            // es 0, así el trazo se dibuja desde ahí.
            const dash = shown && arc > 0 ? Math.max(arc - gap, 0.001) : 0;
            const el = (
              <circle
                key={s.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeLinecap={s.value > 0 ? 'round' : 'butt'}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                className="transition-[stroke-dasharray,stroke-dashoffset] duration-700 ease-out"
              />
            );
            offset += arc;
            return el;
          })}
        </g>
      </svg>

      {/* Centro: etiqueta + total. Absoluto sobre el SVG para centrarlo exacto. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <span
          className={`text-3xl font-bold text-black tabular-nums leading-none transition-opacity ${
            syncing ? 'opacity-60' : ''
          }`}
        >
          {amount}
        </span>
      </div>
    </div>
  );
}

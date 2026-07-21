'use client';

import { useEffect, useState } from 'react';
import { FiClock } from 'react-icons/fi';
import { getGameHourLabel } from '../../stores';

/**
 * Reloj de la hora de JUEGO, sólo la hora en formato 12h am/pm (sin minutos):
 * "2 am", "12 pm", "8 pm". No es la hora local del dispositivo: el día corre
 * acelerado (tipo Minecraft) y es global para todos, definido por el servidor
 * (ver stores/gameClock).
 *
 * El home no renderiza este reloj hasta que la hora está confirmada con el
 * servidor (gate en HomePage), así que acá la hora ya es la definitiva. La card
 * tiene ancho mínimo fijo para que no salte entre horas de 1 y 2 dígitos.
 */
const ROPE_SIDES = ['left', 'right'] as const;

/** Soga trenzada: base tipo yute + franjas diagonales para el hilado. */
const ROPE_STYLE = {
  backgroundColor: '#B98B5E',
  backgroundImage:
    'repeating-linear-gradient(-50deg, rgba(0,0,0,0.28) 0 1px, rgba(255,255,255,0.22) 1px 2px, transparent 2px 3px)',
} as const;

export const MapClock = () => {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(getGameHourLabel());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (!label) return null;

  return (
    // Mismo fondo translúcido que el pill de stats (bg-white/60 + blur) para que
    // la hora no robe foco, y dos cuerdas cortas que suben hasta el borde inferior
    // de ese pill: la card se lee como un cartel de madera colgado de la barra de
    // stats. El alto de las cuerdas (9px) es el hueco medido entre el borde inferior
    // del pill y el tope de esta fila, así que si cambia el offset de la fila en
    // HeaderStats hay que volver a ajustarlo acá. Los remaches son los puntos donde la cuerda "atraviesa" la
    // tabla. El icono va pegado a la izquierda (justify-start): así no se corre
    // cuando la hora pasa de 1 a 2 dígitos ("9 pm" → "10 pm").
    <span className="relative inline-flex h-6 min-w-[68px] items-center justify-start gap-1 rounded-md bg-white/60 px-2 text-xs font-bold text-black backdrop-blur-md">
      {ROPE_SIDES.map((side) => (
        <span key={side} aria-hidden>
          <span className="absolute -top-[9px] h-[9px] w-[3px] rounded-[1px]" style={{ ...ROPE_STYLE, [side]: 10 }} />
          <span className="absolute top-[3px] h-[5px] w-[5px] rounded-full bg-black/25" style={{ [side]: 9 }} />
        </span>
      ))}
      <FiClock className="h-3 w-3 shrink-0" />
      <span className="tabular-nums">{label}</span>
    </span>
  );
};

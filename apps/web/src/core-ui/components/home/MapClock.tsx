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
    // la hora no robe foco, y dos "cuerdas" que suben hasta el borde inferior de
    // ese pill: la card queda visualmente colgada de la barra de stats. El alto
    // de las cuerdas (18px) es el hueco exacto entre el pill y esta fila, así que
    // si cambia el offset de la fila en HeaderStats hay que ajustarlo acá.
    <span className="relative inline-flex h-6 min-w-[68px] items-center justify-center gap-1 rounded-md bg-white/60 px-2 text-xs font-bold text-black backdrop-blur-md">
      <span aria-hidden className="absolute -top-[18px] left-2.5 h-[18px] w-[3px] rounded-full bg-primary" />
      <span aria-hidden className="absolute -top-[18px] right-2.5 h-[18px] w-[3px] rounded-full bg-primary" />
      <FiClock className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
};

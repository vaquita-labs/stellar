'use client';

import { useEffect, useState } from 'react';
import { FiClock } from 'react-icons/fi';

const format = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Reloj de la hora local real (HH:MM) que flota sobre el mapa. El ciclo de luz
 * del mapa se sincroniza con esta misma hora (ver DayCycleSky), así que el reloj
 * y el sol siempre coinciden: de noche real el mapa se ve oscuro.
 *
 * Arranca en null para no romper la hidratación SSR (servidor y cliente pueden
 * tener horas distintas); el valor real se pinta tras montar.
 */
export const MapClock = () => {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setTime(format(new Date()));
    update();
    // 4 refrescos por minuto: barato y nunca se atrasa más de ~15s del minuto.
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, []);

  if (!time) return null;

  return (
    <span className="flex items-center gap-1 rounded-full bg-white/60 backdrop-blur-md px-2.5 py-0.5 text-xs font-bold text-black tabular-nums">
      <FiClock className="h-3 w-3 shrink-0" />
      {time}
    </span>
  );
};

'use client';

import { useEffect, useState } from 'react';
import { FiClock } from 'react-icons/fi';
import { getGameTimeLabel } from '../../stores';

/**
 * Reloj de la hora de JUEGO (HH:MM) que flota sobre el mapa. No es la hora local
 * del dispositivo: el día corre acelerado (tipo Minecraft) y es global para
 * todos, definido por el servidor (ver stores/gameClock). El ciclo de luz del
 * mapa sigue este mismo reloj (ver DayCycleSky), así que el reloj y el sol
 * siempre coinciden.
 *
 * Arranca en null para no romper la hidratación SSR; el valor real se pinta tras
 * montar.
 */
export const MapClock = () => {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setTime(getGameTimeLabel());
    update();
    // El día va acelerado, así que un minuto de juego pasa en ~1s real: se
    // refresca cada segundo para que el reloj avance de forma fluida.
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (!time) return null;

  return (
    // Fondo blanco con esquinas suaves (no pastilla redonda) y sin borde, para
    // que resalte sobre el mapa sin verse como un botón.
    <span className="flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs font-bold text-black tabular-nums">
      <FiClock className="h-3 w-3 shrink-0" />
      {time}
    </span>
  );
};

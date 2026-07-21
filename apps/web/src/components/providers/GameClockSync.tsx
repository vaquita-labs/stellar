'use client';

import { getJson } from '@/core-ui/api/http';
import { syncGameClock } from '@/core-ui/stores';
import { useEffect } from 'react';

interface GameClockDTO {
  serverTimeMs: number;
  dayLengthSeconds: number;
  anchorMs: number;
}

/**
 * Sincroniza el reloj de juego con el servidor (fuente de verdad global). En
 * cada carga hace un fetch FRESCO a GET /api/v1/time y pregunta "qué hora es",
 * porque `serverTimeMs` sólo es válido en el instante del fetch: usarlo cacheado
 * (react-query persiste en localStorage) haría que el offset se calcule contra
 * un timestamp viejo y el reloj saltara hacia atrás al recargar. Por eso NO usa
 * react-query: fetch directo al montar + cada 10 min + al volver el foco.
 *
 * No renderiza nada. Si falla, el reloj sigue con el default local (mismo ancla
 * y duración) hasta el próximo intento, así que la vista nunca se rompe.
 */
export function GameClockSync() {
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const data = await getJson<GameClockDTO>('/time');
        if (!cancelled && data) syncGameClock(data);
      } catch {
        // Se reintenta en el próximo tick; mientras tanto corre el default local.
      }
    };

    void sync();
    const id = setInterval(() => void sync(), 10 * 60 * 1000);
    const onFocus = () => void sync();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}

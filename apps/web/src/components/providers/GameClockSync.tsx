'use client';

import { apiFetch } from '@/core-ui/api/http';
import { fallbackGameClock, syncGameClock } from '@/core-ui/stores';
import { useEffect } from 'react';

interface GameClockDTO {
  serverTimeMs: number;
  dayLengthSeconds: number;
  anchorMs: number;
}

/** Corta la request si el servidor no contesta: `fetch` no tiene timeout y una
 *  request colgada nunca resuelve ni rechaza. */
const FETCH_TIMEOUT_MS = 8000;
/** Reintentos inmediatos tras un fallo (después manda el intervalo largo). */
const RETRY_DELAYS_MS = [1000, 3000, 10000];
/** Resincronización periódica en régimen normal. */
const RESYNC_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Sincroniza el reloj de juego con el servidor (fuente de verdad global). En
 * cada carga hace un fetch FRESCO a GET /api/v1/time y pregunta "qué hora es",
 * porque `serverTimeMs` sólo es válido en el instante del fetch: usarlo cacheado
 * (react-query persiste en localStorage) haría que el offset se calcule contra
 * un timestamp viejo y el reloj saltara hacia atrás al recargar. Por eso NO usa
 * react-query: fetch directo al montar + backoff corto si falla + cada 10 min +
 * al volver el foco.
 *
 * No renderiza nada. Si falla, el reloj arranca con el default local
 * (`fallbackGameClock`) para que la home NO se quede en la pantalla de carga:
 * antes, un solo fallo dejaba `synced` en false y el único reintento llegaba
 * 10 minutos después.
 */
export function GameClockSync() {
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const sync = async () => {
      try {
        const data = await apiFetch<GameClockDTO>('/time', { timeoutMs: FETCH_TIMEOUT_MS });
        if (cancelled) return;
        if (!data) throw new Error('Empty game clock response');
        syncGameClock(data);
        attempt = 0;
      } catch {
        if (cancelled) return;
        // Primero desbloquear la vista, después insistir: la hora local es una
        // aproximación buena (offset de ms) y el reintento la corrige.
        fallbackGameClock();
        const delay = RETRY_DELAYS_MS[attempt];
        attempt += 1;
        // Agotado el backoff se deja de insistir seguido; quedan el intervalo
        // largo y el foco, para no martillar una API caída.
        if (delay !== undefined) retryTimer = setTimeout(() => void sync(), delay);
      }
    };

    void sync();
    const id = setInterval(() => void sync(), RESYNC_INTERVAL_MS);
    const onFocus = () => {
      attempt = 0;
      void sync();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(retryTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}

'use client';

import { getJson } from '@/core-ui/api/http';
import { syncGameClock } from '@/core-ui/stores';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

interface GameClockDTO {
  serverTimeMs: number;
  dayLengthSeconds: number;
  anchorMs: number;
}

/**
 * Sincroniza el reloj de juego con el servidor (fuente de verdad global). Se
 * monta una vez a nivel app; refetchea de a ratos para corregir la deriva del
 * reloj local. No renderiza nada. Si falla, el reloj sigue andando con el
 * default local (mismo ancla), así que nunca se rompe la vista.
 */
export function GameClockSync() {
  const { data } = useQuery<GameClockDTO | null>({
    queryKey: ['game-clock'],
    queryFn: () => getJson<GameClockDTO>('/time'),
    // El servidor es la referencia: revalidar cada 10 min corrige la deriva sin
    // pegarle seguido (el offset apenas cambia). Ignora el staleTime global.
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  useEffect(() => {
    if (data) syncGameClock(data);
  }, [data]);

  return null;
}

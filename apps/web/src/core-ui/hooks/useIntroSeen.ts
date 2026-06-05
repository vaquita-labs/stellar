'use client';

import { useCallback, useEffect, useState } from 'react';

// Estado del onboarding intro (carrusel pre-login). Como aún no hay usuario
// autenticado, se persiste por dispositivo en localStorage en vez de en el
// backend. No usar env vars para esto: el env es global al build y no puede
// saber si ESTE dispositivo ya vio el intro.
const INTRO_SEEN_KEY = 'vaquita:intro-seen';

interface UseIntroSeen {
  /** `true` cuando ya leímos localStorage en el cliente (evita parpadeo en SSR). */
  hydrated: boolean;
  /** Si este dispositivo ya vio el intro alguna vez. */
  seen: boolean;
  /** Marca el intro como visto y lo persiste. */
  markSeen: () => void;
  /** Vuelve a mostrar el intro (replay), sin borrar la marca persistida. */
  replay: () => void;
}

export const useIntroSeen = (): UseIntroSeen => {
  const [hydrated, setHydrated] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSeen(window.localStorage.getItem(INTRO_SEEN_KEY) === 'true');
    }
    setHydrated(true);
  }, []);

  const markSeen = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(INTRO_SEEN_KEY, 'true');
    }
    setSeen(true);
  }, []);

  const replay = useCallback(() => {
    setSeen(false);
  }, []);

  return { hydrated, seen, markSeen, replay };
};

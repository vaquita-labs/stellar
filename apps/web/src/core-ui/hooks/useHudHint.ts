'use client';

import { RefObject, useEffect, useRef } from 'react';

// Una sola vez por dispositivo: no hay usuario cuando esto corre por primera vez
// y tampoco vale la pena un campo en el backend para un guiño de 7 segundos.
const HUD_HINT_KEY = 'vaquita:hud-hint-seen';
const HINT_CLASS = 'animate-hud-hint';
const HINT_DURATION_MS = 7000;

/**
 * Llamada de atención inicial sobre los accesos rápidos del mapa: la primera
 * vez que este dispositivo abre el home, se mueven unos segundos para que se
 * vean como algo que responde y no como parte del escenario. Se marca visto al
 * montar (no al terminar), así el guiño ocurre exactamente una vez aunque el
 * usuario cierre la app en el medio.
 *
 * Devuelve una ref para el contenedor de los accesos. La animación se pone y se
 * saca por clase en el DOM, no por estado: si viviera en un `useState` habría
 * que decidirla en el render, y el render del server no puede leer
 * localStorage — arrancaría animando para todos y cortaría al hidratar.
 */
export const useHudHint = (): RefObject<HTMLDivElement | null> => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof window === 'undefined') return;
    if (window.localStorage.getItem(HUD_HINT_KEY) === 'true') return;

    window.localStorage.setItem(HUD_HINT_KEY, 'true');
    node.classList.add(HINT_CLASS);
    const id = setTimeout(() => node.classList.remove(HINT_CLASS), HINT_DURATION_MS);
    return () => {
      clearTimeout(id);
      node.classList.remove(HINT_CLASS);
    };
  }, []);

  return ref;
};

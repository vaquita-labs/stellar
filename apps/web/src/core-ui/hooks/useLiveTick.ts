'use client';

import { useEffect, useState } from 'react';

/**
 * Cadencia de los contadores en vivo (saldo del header, "Available" del retiro).
 * Corta para que los últimos decimales de USDC se vean moverse.
 */
export const LIVE_TICK_MS = 250;

// Un ÚNICO timer para toda la app, no uno por hook. Dos tickers desfasados
// hacían renderizar el header ~8 veces por segundo, y cada uno de esos updates
// cae en medio de la navegación de Next: `<Link>` navega dentro de una
// transition, y cualquier update de prioridad normal la descarta y la reinicia
// desde la raíz. Ir de /home a /profile (desmontar el mundo 3D + montar el
// perfil) tarda más que un tick, así que la transition se moría antes de
// commitear y el toque al avatar "no hacía nada". Con un solo timer los
// consumidores tickean en el mismo frame, y lo que solo pinta números ni
// siquiera re-renderiza (ver `subscribeLiveTick`).
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

const tick = () => {
  for (const listener of listeners) listener();
};

/**
 * Suscribe un callback al tick compartido; devuelve la baja. El timer arranca
 * con el primer suscriptor y se apaga cuando no queda ninguno.
 *
 * Para lo que solo pinta un número, preferí esto sobre `useLiveTick`: el
 * callback escribe el DOM por ref y se ahorra el re-render entero (ver
 * <LiveBalance>). `useLiveTick` es para cuando el valor sí participa del render
 * (cálculos, validaciones, deshabilitar botones).
 */
export const subscribeLiveTick = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (intervalId === null) intervalId = setInterval(tick, LIVE_TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
};

/** El tick compartido como estado: re-renderiza al componente en cada tick. */
export const useLiveTick = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribeLiveTick(() => setNow(Date.now())), []);
  return now;
};

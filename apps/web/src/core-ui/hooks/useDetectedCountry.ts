'use client';

import { useSyncExternalStore } from 'react';
import { detectCountry, type DetectedCountry } from '../helpers/detectCountry';

/**
 * Las señales no cambian durante la sesión —la cookie llega con el documento, la
 * zona horaria y el idioma son del sistema—, así que se leen una vez y se
 * recuerdan. Además `getSnapshot` TIENE que devolver siempre la misma
 * referencia: recalcular el objeto en cada llamada dejaría a React re-renderizando
 * sin parar.
 */
let cached: DetectedCountry | null | undefined;

const readDetected = (): DetectedCountry | null => {
  if (cached === undefined) {
    cached = detectCountry({
      cookie: document.cookie,
      // Safari viejo devuelve undefined acá; `detectCountry` lo tolera.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
    });
  }
  return cached;
};

/** No hay nada a qué suscribirse: el valor se fija en el primer render del cliente. */
const subscribe = () => () => {};

/**
 * Dónde parece estar el usuario, para sugerírselo. Devuelve `null` en el
 * servidor y `null` para siempre si ninguna señal alcanzó: quien lo usa tiene
 * que seguir funcionando igual sin sugerencia.
 *
 * Va por `useSyncExternalStore` y no por un efecto porque las tres señales son
 * del browser: leerlas durante el render haría que el HTML del servidor y el del
 * cliente no coincidan, y este hook es justamente la forma que tiene React de
 * decir "en el servidor esto no existe".
 */
export function useDetectedCountry(): DetectedCountry | null {
  return useSyncExternalStore(subscribe, readDetected, () => null);
}

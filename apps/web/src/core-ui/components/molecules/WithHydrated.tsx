'use client';

import { ReactNode } from 'react';
import { useHasHydrated } from '../../hooks';
import { LoaderScreen } from './LoaderScreen';

/** `fallback` reemplaza a la pantalla de carga con la vaquita: en pantallas que
 *  ya tienen su propio placeholder, el loader a página completa se ve como si
 *  se hubiera abierto otra pantalla en medio de la navegación. */
export function WithHydrated({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const hydrated = useHasHydrated();

  if (hydrated) {
    return children;
  }

  return fallback ?? <LoaderScreen withImage />;
}

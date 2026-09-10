'use client';

import { HomePage } from '@/core-ui/components';
import { Suspense } from 'react';

// El límite de Suspense envuelve el árbol del home entero. Ningún componente de
// los que cuelgan de acá llama a `useSearchParams` hoy, así que no hay una línea
// concreta que señalar: queda porque el árbol es grande y las piezas que se le
// cuelgan cambian seguido, y sin el límite un `useSearchParams` nuevo en
// cualquiera de ellas rompe el build de la ruta.
export default function Page() {
  return (
    <Suspense>
      <HomePage />
    </Suspense>
  );
}

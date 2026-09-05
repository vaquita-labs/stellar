'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * `/` no es una pantalla: rebota a `/home`. Pero es donde aterrizan TODOS los
 * links compartidos —el `?ref=` de una campaña, los `utm_*` de un anuncio— así
 * que el rebote tiene que llevarse la query string con él.
 *
 * Antes hacía `router.replace('/home')` a secas y se comía los parámetros. El
 * capturador de atribución vive en el layout raíz y sus efectos corren DESPUÉS
 * de los de esta página (React ejecuta los hijos primero), así que reescribir la
 * URL acá era carrera perdida: la campaña que trajo al usuario desaparecía antes
 * de que nadie la leyera.
 */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const search = window.location.search;
    router.replace(search ? `/home${search}` : '/home');
  }, [router]);

  return null;
}

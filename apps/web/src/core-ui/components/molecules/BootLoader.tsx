'use client';

import { usePathname } from 'next/navigation';
import { HomeSkeleton } from '../home/HomeSkeleton';
import { PageSkeleton } from './PageSkeleton';
import { ProfileSkeleton } from './ProfileSkeleton';

/**
 * Pantalla de carga del arranque. El arranque encadena varios gates (hidratación
 * → wallet → auth → config → perfil → reloj de juego) y todos deben mostrar LO
 * MISMO, si no la carga parpadea entre pantallas distintas: por eso todos
 * renderizan este componente en vez de elegir loader por su cuenta.
 *
 * La carga es POR PANTALLA, no un loader genérico: cada ruta muestra el
 * esqueleto de la pantalla que está por abrirse, con sus medidas reales. Así se
 * entiende qué está cargando, no hay salto de layout al llegar los datos, y el
 * relevo con el skeleton propio de la página (el que usa mientras pide SUS
 * datos) no se nota.
 *
 * Para sumar una pantalla: agregar su esqueleto acá abajo. Si la pantalla ya
 * tiene uno propio, replicar sus medidas en vez de importarlo — este componente
 * vive en el root layout, así que todo lo que importe entra al bundle inicial
 * de TODAS las rutas.
 *
 * La vaquita animada (<LoaderScreen>) ya no se usa acá a propósito: tapaba la
 * pantalla entera y se leía como si se hubiera abierto otra cosa en el medio.
 */
export const BootLoader = () => {
  const pathname = usePathname() ?? '';
  const isExactly = (route: string) => pathname === route;
  const isUnder = (route: string) => pathname.startsWith(`${route}/`);

  // Home: header naranja + cielo + botonera.
  if (isExactly('/') || isExactly('/home') || isUnder('/home')) return <HomeSkeleton />;

  // Perfil: banner con avatar, stats y tarjetas. Sus sub-pantallas
  // (/profile/settings, /profile/friends…) son listas dentro de <PageLayout>.
  if (isExactly('/profile')) return <ProfileSkeleton />;

  // Explorar: tarjetas altas con preview del mapa. Su detalle
  // (/explore/<username>) es la cabecera del usuario y el mapa a pantalla completa.
  if (isExactly('/explore')) return <PageSkeleton variant="cards" />;
  if (isUnder('/explore')) return <PageSkeleton variant="map" />;

  // Resto (leaderboard, notificaciones, transacciones, sub-pantallas de
  // perfil…): el chrome de <PageLayout> con una lista de filas.
  return <PageSkeleton variant="rows" />;
};

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useIsAuthenticated, useProfileData } from '../../../hooks';

const TUTORIAL_ROUTE = '/tutorial';

/**
 * Después del login (y de tener nickname), si el perfil no completó el tutorial
 * redirige a `/tutorial`. La fuente de verdad es el flag `tutorialCompleted` del
 * backend (per-usuario), no una env: un usuario que vuelve no lo repite.
 *
 * El tutorial vive en su propia ruta (recrea el home), por eso aquí solo
 * redirigimos en vez de montar un overlay sobre la pantalla actual.
 */
export function TutorialGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const pathname = usePathname();
  const router = useRouter();
  const { data, isLoading, isError } = useProfileData();

  const decided = isAuthenticated && !isLoading && !isError && !!data;
  const needsTutorial = decided && !data.tutorialCompleted;
  const onTutorial = pathname === TUTORIAL_ROUTE;

  useEffect(() => {
    if (needsTutorial && !onTutorial) router.replace(TUTORIAL_ROUTE);
  }, [needsTutorial, onTutorial, router]);

  // Evitar el flash de la app mientras redirigimos al tutorial.
  if (needsTutorial && !onTutorial) return null;

  return <>{children}</>;
}

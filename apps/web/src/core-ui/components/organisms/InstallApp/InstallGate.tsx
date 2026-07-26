'use client';

import { ReactNode } from 'react';
import { useInstallApp, useInstallDismissed, useIsAuthenticated } from '../../../hooks';
import { InstallPrompt } from './InstallPrompt';

/**
 * Apenas te logueás (gate más externo, dentro de <RequireAuth>) empuja a
 * instalar la app en el inicio. Se muestra UNA sola vez por dispositivo: al
 * verla queda marcada (localStorage) y el próximo reload ya no bloquea.
 *
 * Sólo aplica en móvil: en desktop "agregar a inicio" no tiene el mismo sentido
 * y bloquearía el uso en escritorio/dev. Transparente también cuando ya corremos
 * como app instalada (`isStandalone`).
 */
export function InstallGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const { isStandalone, isMobile } = useInstallApp();
  const dismissed = useInstallDismissed();

  if (isAuthenticated && isMobile && !isStandalone && !dismissed) {
    return <InstallPrompt />;
  }

  return <>{children}</>;
}

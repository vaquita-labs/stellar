'use client';

import { useState } from 'react';

// La pantalla de instalar es un empujón que se muestra UNA sola vez por
// dispositivo: apenas se ve, la marcamos como vista y el próximo reload ya no
// vuelve a bloquear. Por dispositivo en localStorage (no hay usuario/campo de
// backend para esto y es una decisión de UX local), igual que el intro
// pre-login ([[useIntroSeen]] usa el mismo patrón).
const INSTALL_DISMISSED_KEY = 'vaquita:install-dismissed';

/** Persiste que este dispositivo ya vio la pantalla de instalar. */
export const dismissInstallPrompt = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
  }
};

/**
 * `true` si este dispositivo ya vio la pantalla de instalar alguna vez.
 *
 * Lee localStorage en el inicializador (lazy) en vez de un efecto: <InstallGate>
 * sólo monta en cliente (dentro de <RequireAuth>, que devuelve null hasta
 * autenticar), así que es seguro y evita el parpadeo de la pantalla para quien
 * ya la descartó. No es reactivo a propósito: el descarte dispara un reload.
 */
export const useInstallDismissed = (): boolean => {
  const [dismissed] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true'
  );
  return dismissed;
};

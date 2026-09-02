'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { isPostHogEnabled, isSessionReplayEnabled, posthogHost } from '@/core-ui/config/featureFlags';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { ReactNode, useEffect } from 'react';

// Módulo, no ref: en StrictMode el árbol se monta dos veces y `init` tiene que
// correr una sola. `posthog` es un singleton igual, así que el guard vive donde
// vive él.
let started = false;

const start = () => {
  if (started || !isPostHogEnabled()) return;
  started = true;
  posthog.init(clientEnv.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: posthogHost(),
    // Con `api_host` apuntando al rewrite propio, posthog-js ya no sabe cuál es
    // la app de PostHog: sin esto los links que arma la librería (toolbar,
    // encuestas) apuntan a nuestro dominio y no abren.
    ui_host: 'https://us.posthog.com',
    // Los defaults de posthog-js cambian por fecha. Clavarla evita que una
    // actualización de la librería cambie qué se captura sin que nadie lo haya
    // pedido; y sin este campo la propia librería avisa por consola.
    defaults: '2025-05-24',
    // Los pageviews los manda el efecto de abajo. El App Router navega sin
    // recargar el documento, así que el automático se pierde los cambios de
    // ruta del cliente, que son casi todos.
    capture_pageview: false,
    // El replay tiene su propio flag y arranca apagado: /privacy todavía no dice
    // que se graban sesiones, y la app no tiene mecanismo de consentimiento.
    disable_session_recording: !isSessionReplayEnabled(),
    // Se empieza CERRADO y se destapa a mano lo que haga falta, nunca al revés:
    // destapar de más se arregla, taparlo después no —el dato ya salió y ya está
    // guardado en un tercero—.
    session_recording: {
      // `maskAllInputs` tapa lo que se escribe; el saldo, el valor del
      // portafolio, la dirección de la wallet y el nickname son texto
      // RENDERIZADO, y eso sólo lo tapa el selector.
      maskAllInputs: true,
      maskTextSelector: '*',
      // Lo que ni siquiera es texto: el QR del pago y el de la dirección.
      blockSelector: '[data-ph-block]',
      // El home es react-three-fiber: grabar el canvas sería grabar el mundo 3D
      // entero, cuadro por cuadro, para nada. Es el default, pero se deja
      // explícito porque el proyecto de PostHog puede prenderlo por remoto.
      captureCanvas: { recordCanvas: false },
    },
    // Sólo se crea persona cuando llamamos a `identify` (ver PostHogIdentify).
    // Un anónimo que nunca se loguea no genera un perfil de persona.
    person_profiles: 'identified_only',
  });
};

/**
 * Analytics. Reemplaza a Umami, que era un `<script>` en el `<head>` del layout
 * (server component); esto tiene que ser cliente, así que vive acá y no allá.
 *
 * Va POR ENCIMA de `PollarProvider`: las pantallas de intro y de login son
 * pageviews como cualquier otra, y esperar a que resuelva la sesión perdería la
 * primera —justo la que dice cuánta gente llega y no entra—.
 *
 * Sin clave o con el flag apagado no inicializa nada: la app queda exactamente
 * como antes de que el analytics existiera, que es el estado de un entorno cuyo
 * panel todavía no se llenó.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    start();
  }, []);

  useEffect(() => {
    if (!started || !pathname) return;
    // Sin la query: leerla con `useSearchParams` obliga a un <Suspense> en el
    // render estático y rompe el build, y `$current_url` ya la trae igual.
    posthog.capture('$pageview');
  }, [pathname]);

  return children;
}

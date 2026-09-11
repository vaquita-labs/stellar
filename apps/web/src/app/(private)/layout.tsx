import {
  AttributionFlush,
  ClaimGate,
  FollowLinkCapture,
  LegalGate,
  PendingFollowConsumer,
  PullToRefresh,
  PushSubscriptionSync,
  PwaInstallReporter,
  ReleaseNotesGate,
  RequireAuth,
  TutorialGate,
  UsernameGate,
} from '@/core-ui/components';

export default function PrivateLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  // Slot paralelo `@modal`: hojas que se apilan SOBRE la página actual sin
  // desmontarla (ej. /portafolio interceptado sobre /home, para no recargar el
  // mundo 3D). Fuera de esta ruta el slot cae en `@modal/default.tsx` (null).
  modal: React.ReactNode;
}) {
  return (
    <>
      {/* Outside the gates: stash `?follow=` deep links before the login
          redirect can drop them. Consumed after onboarding (below). */}
      <FollowLinkCapture />
      <RequireAuth>
        {/* Primer gate del árbol privado: sin una aceptación registrada de la
            política vigente no se monta NADA, ni siquiera el onboarding. */}
        <LegalGate>
          {/* El empujón de instalar la app vive en /login (antes de autenticarse):
              así el usuario instala primero y se loguea UNA sola vez dentro de la
              app — en iOS el storage de la app instalada no comparte la sesión
              con el navegador. */}
          <UsernameGate>
            <TutorialGate>
              <ClaimGate>
                <PendingFollowConsumer />
                {/* Dentro de los gates: recién acá hay wallet a la que
                    atribuir el aterrizaje guardado en la primera visita. */}
                <AttributionFlush />
                <PushSubscriptionSync />
                {/* Beside the push pair on purpose: an installed app is what
                    makes push reachable on iOS, and this is the only place we
                    ever learn a wallet has one. Reports state on every launch;
                    nothing tells us about an uninstall. */}
                <PwaInstallReporter />
                {/* El pedido de permiso de notificaciones NO va acá: este layout
                    no se desmonta al navegar, así que la hoja aparecía sobre la
                    pantalla en la que estuviera el usuario (se reportó sobre
                    /profile). Lo monta `HomePage`, que es donde también viven
                    los modales a los que tiene que adelantarse. */}
                {/* Después del pedido de notificaciones y, sobre todo, después de
                    que el prompt de dinero ocioso se resuelva (lo coordina
                    `useModalQueueStore`): un anuncio no puede taparle a nadie la
                    decisión de depositar. */}
                <ReleaseNotesGate />
                {/* The app's scroll region, and the only place a pull-to-refresh
                    can live: `html`/`body` are pinned to the viewport, so the
                    document never overscrolls and the browser gesture never
                    fires. Excluded on the home map, which pans with the same
                    drag (see PullToRefresh). */}
                <PullToRefresh className="flex-1 min-h-0 overflow-auto">{children}</PullToRefresh>
                {/* Dentro de los gates: el overlay solo se pinta para usuarios
                    autenticados y onboarded, igual que el contenido. */}
                {modal}
              </ClaimGate>
            </TutorialGate>
          </UsernameGate>
        </LegalGate>
      </RequireAuth>
    </>
  );
}

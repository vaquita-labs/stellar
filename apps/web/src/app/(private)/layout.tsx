import {
  ClaimGate,
  FollowLinkCapture,
  PendingFollowConsumer,
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
        <UsernameGate>
          <TutorialGate>
            <ClaimGate>
              <PendingFollowConsumer />
              <main className="flex-1 min-h-0 overflow-auto">{children}</main>
              {/* Dentro de los gates: el overlay solo se pinta para usuarios
                  autenticados y onboarded, igual que el contenido. */}
              {modal}
            </ClaimGate>
          </TutorialGate>
        </UsernameGate>
      </RequireAuth>
    </>
  );
}

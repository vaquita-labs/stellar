import { create } from 'zustand';

/**
 * Orden entre los modales que se abren solos al entrar a la app.
 *
 * El orden es explícito, de más a menos consecuencias: primero el permiso de
 * notificaciones, después el tour del home, el regalo de bienvenida
 * (`ClaimGate` → `ClaimRewardModal`), el prompt de dinero ocioso (`AutoInvest`
 * → `IdleFundsModal`), el badge pendiente de reclamar (`BadgeClaimGate`) y,
 * último, las notas de versión. Apilados se tapan —los
 * primeros son de pantalla completa— y un anuncio no puede quedar encima de una
 * decisión ni de un premio.
 *
 * El permiso de notificaciones va adelante de todo aunque no sea la decisión
 * más grande: es el único pedido que VENCE. El sistema operativo lo ofrece una
 * sola vez, así que taparlo no lo posterga, lo pierde. Los demás siguen estando
 * ahí en la próxima carga.
 *
 * Fuera de iOS ese pedido ya no es un modal nuestro: `PushNudge` llama derecho
 * a `Notification.requestPermission()` y el diálogo lo dibuja el navegador, por
 * encima de la página. Nada de la app puede taparlo, así que ahí el turno se
 * libera al toque y los otros modales no esperan una respuesta que no es
 * nuestra. En iOS el sheet sigue existiendo —Safari necesita el tap— y como es
 * un modal común mantiene el turno hasta que lo respondan.
 *
 * No se puede resolver anidando componentes: `AutoInvest` y `BadgeClaimGate`
 * viven en el home (`HomePage`) y el gate de notas en el layout privado, que es
 * su ancestro. Este store es el único hilo entre los dos subárboles.
 *
 * Tomar y liberar el turno están en componentes distintos a propósito:
 *
 * - Lo TOMA `HomePage`, en un efecto que corre ANTES de su gate de `clockReady`.
 *   `AutoInvest` monta debajo de ese gate, o sea detrás de un GET /time, y para
 *   entonces el gate de notas ya llegó a mostrar la nota y a sacarla de pantalla.
 * - Lo LIBERA `AutoInvest`, que es el único que sabe si hay dinero que ofrecer.
 *
 * Arranca en `true` (nada que esperar) a propósito: en las rutas donde
 * `AutoInvest` ni siquiera se monta —perfil, ajustes— nadie lo va a apagar, y
 * un default `false` dejaría las notas trabadas para siempre ahí.
 */
type ModalQueueState = {
  /**
   * ¿Ya se decidió si el pedido de permiso de notificaciones aparece? Es el
   * primero de la cola, así que no espera a nadie: lo TOMA `HomePage` y lo
   * LIBERA `PushNudge` —cuando decide no pedir nada, cuando dispara el diálogo
   * del sistema (fuera de iOS, sin esperar la respuesta) y cuando el usuario
   * responde el sheet de iOS, lo acepte o lo postergue.
   *
   * Mismo default y mismo motivo que los otros tres: `true` es "nada que
   * esperar", para que en las rutas donde `PushNudge` no monta —perfil,
   * ajustes— lo que hace cola detrás no quede trabado para siempre.
   */
  pushNudgeSettled: boolean;
  setPushNudgeSettled: (settled: boolean) => void;
  /**
   * ¿Ya se decidió si el regalo de bienvenida aparece? Va justo detrás del tour
   * porque es el último paso del onboarding: el usuario acaba de terminar el
   * tutorial y todavía no depositó nada, así que ofrecerle su primer dólar va
   * antes que cualquier cosa que se pueda hacer con dinero que ya tiene.
   *
   * Lo TOMA y lo LIBERA `ClaimGate`: vive en el layout privado, o sea monta
   * antes que el home, y es el único que sabe si el regalo sigue sin reclamar.
   */
  welcomeClaimSettled: boolean;
  setWelcomeClaimSettled: (settled: boolean) => void;
  /** ¿Ya se decidió si el prompt de dinero ocioso aparece? */
  vaultPromptSettled: boolean;
  setVaultPromptSettled: (settled: boolean) => void;
  /**
   * Has the home tour finished (or decided it is not showing)? The coach marks
   * cover the whole screen, so nothing else that opens by itself may stack on
   * top of them. Taken by `HomePage` and released by `HomeTour`, which is the
   * only component that knows whether the user still needs it.
   *
   * Same default and reasoning as `vaultPromptSettled`: `true` means "nothing to
   * wait for", so on the routes where `HomeTour` never mounts — profile,
   * settings — the modals that queue behind it are not stuck forever.
   */
  homeTourSettled: boolean;
  setHomeTourSettled: (settled: boolean) => void;
  /**
   * Has the pending-badge prompt finished (or decided it is not showing)? The
   * claim sheet is full-screen on a phone, and it pays out coins — an
   * announcement may not cover it. Taken by `HomePage` and released by
   * `BadgeClaimGate`, the only component that knows whether the wallet has a
   * badge waiting.
   *
   * Same default and reasoning as the two above: `true` means "nothing to wait
   * for", so on the routes where `BadgeClaimGate` never mounts the modals
   * queued behind it are not stuck forever.
   */
  badgeClaimSettled: boolean;
  setBadgeClaimSettled: (settled: boolean) => void;
};

export const useModalQueueStore = create<ModalQueueState>((set) => ({
  pushNudgeSettled: true,
  setPushNudgeSettled: (pushNudgeSettled: boolean) => set({ pushNudgeSettled }),
  welcomeClaimSettled: true,
  setWelcomeClaimSettled: (welcomeClaimSettled: boolean) => set({ welcomeClaimSettled }),
  vaultPromptSettled: true,
  setVaultPromptSettled: (vaultPromptSettled: boolean) => set({ vaultPromptSettled }),
  homeTourSettled: true,
  setHomeTourSettled: (homeTourSettled: boolean) => set({ homeTourSettled }),
  badgeClaimSettled: true,
  setBadgeClaimSettled: (badgeClaimSettled: boolean) => set({ badgeClaimSettled }),
}));

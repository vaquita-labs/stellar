import { create } from 'zustand';

/**
 * Orden entre los modales que se abren solos al entrar a la app.
 *
 * Hoy hay dos, y el pedido es explícito: primero el prompt de plata ociosa
 * (`AutoInvest` → `IdleFundsModal`), y recién cuando el usuario decidió qué
 * hacer con su plata, las notas de versión. Apilados se tapan —el de la plata
 * es de pantalla completa— y es el que tiene consecuencias.
 *
 * No se puede resolver anidando componentes: `AutoInvest` vive en el home
 * (`HomePage`) y el gate de notas en el layout privado, que es su ancestro. Este
 * store es el único hilo entre los dos subárboles.
 *
 * Tomar y liberar el turno están en componentes distintos a propósito:
 *
 * - Lo TOMA `HomePage`, en un efecto que corre ANTES de su gate de `clockReady`.
 *   `AutoInvest` monta debajo de ese gate, o sea detrás de un GET /time, y para
 *   entonces el gate de notas ya llegó a mostrar la nota y a sacarla de pantalla.
 * - Lo LIBERA `AutoInvest`, que es el único que sabe si hay plata que ofrecer.
 *
 * Arranca en `true` (nada que esperar) a propósito: en las rutas donde
 * `AutoInvest` ni siquiera se monta —perfil, ajustes— nadie lo va a apagar, y
 * un default `false` dejaría las notas trabadas para siempre ahí.
 */
type ModalQueueState = {
  /** ¿Ya se decidió si el prompt de plata ociosa aparece? */
  vaultPromptSettled: boolean;
  setVaultPromptSettled: (settled: boolean) => void;
  /**
   * Has the home tour finished (or decided it is not showing)? The coach marks
   * cover the whole screen, so nothing else that opens by itself may stack on
   * top of them. Taken and released by `HomeTour`, which is the only component
   * that knows whether the user still needs it.
   *
   * Same default and reasoning as `vaultPromptSettled`: `true` means "nothing to
   * wait for", so on the routes where `HomeTour` never mounts — profile,
   * settings — the modals that queue behind it are not stuck forever.
   */
  homeTourSettled: boolean;
  setHomeTourSettled: (settled: boolean) => void;
};

export const useModalQueueStore = create<ModalQueueState>((set) => ({
  vaultPromptSettled: true,
  setVaultPromptSettled: (vaultPromptSettled: boolean) => set({ vaultPromptSettled }),
  homeTourSettled: true,
  setHomeTourSettled: (homeTourSettled: boolean) => set({ homeTourSettled }),
}));

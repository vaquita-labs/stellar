import { create } from 'zustand';

/**
 * Orden entre los modales que se abren solos al entrar a la app.
 *
 * Hoy hay dos, y el pedido es explícito: primero el prompt de plata ociosa
 * (`AutoInvest` → `IdleFundsModal`), y recién cuando el usuario decidió qué
 * hacer con su plata, las notas de versión. Los dos son de pantalla completa;
 * apilados se tapan, y el de la plata es el que tiene consecuencias.
 *
 * No se puede resolver anidando componentes: `AutoInvest` vive en el home
 * (`HomePage`) y el gate de notas en el layout privado, que es su ancestro. Este
 * store es el único hilo entre los dos subárboles.
 *
 * Arranca en `true` (nada que esperar) a propósito: en las rutas donde
 * `AutoInvest` ni siquiera se monta —perfil, ajustes— nadie lo va a apagar, y
 * un default `false` dejaría las notas trabadas para siempre ahí.
 */
type ModalQueueState = {
  /** ¿Ya se decidió si el prompt de plata ociosa aparece? */
  vaultPromptSettled: boolean;
  setVaultPromptSettled: (settled: boolean) => void;
};

export const useModalQueueStore = create<ModalQueueState>((set) => ({
  vaultPromptSettled: true,
  setVaultPromptSettled: (vaultPromptSettled: boolean) => set({ vaultPromptSettled }),
}));

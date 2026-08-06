import { create } from 'zustand';

/**
 * Marca que hay un off-ramp moviendo plata: el USDC que en ese momento está en la
 * wallet salió del vault para pagarle a la rampa y NO es plata ociosa.
 *
 * Sin esto, el gate de plata ociosa (`useIdleFunds`) ve ese USDC recién llegado,
 * abre su pantalla completa sobre el modal del retiro y lo devuelve al vault —
 * dejando a la rampa sin nada que cobrar y el retiro colgado para siempre. Pasó:
 * dos retiros de 1.74 USDC volvieron al vault en un solo depósito de 3.48 mientras
 * el modal esperaba al proveedor.
 *
 * Lo prenden los modales de off-ramp mientras dura el flujo y lo consume
 * `useIdleFunds`, que viven en subárboles distintos. Mismo patrón que
 * {@link useReceiveModalStore}.
 */
type OfframpState = {
  /** Hay un retiro a fiat en curso con USDC reservado en la wallet. */
  isOfframpActive: boolean;
  setOfframpActive: (active: boolean) => void;
};

export const useOfframpStore = create<OfframpState>((set) => ({
  isOfframpActive: false,
  setOfframpActive: (isOfframpActive: boolean) => set({ isOfframpActive }),
}));

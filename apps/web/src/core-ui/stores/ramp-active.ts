import { create } from 'zustand';

/**
 * Marca que hay una rampa a medio camino: el USDC que en ese momento está en la
 * wallet pertenece a esa operación y NO es plata ociosa.
 *
 * En el off-ramp ese USDC salió del vault para pagarle a la rampa. Sin esta
 * marca, el gate de plata ociosa (`useIdleFunds`) lo ve recién llegado, abre su
 * pantalla completa sobre el modal del retiro y lo devuelve al vault — dejando a
 * la rampa sin nada que cobrar y el retiro colgado para siempre. Pasó: dos
 * retiros de 1.74 USDC volvieron al vault en un solo depósito de 3.48 mientras
 * el modal esperaba al proveedor.
 *
 * En el on-ramp la plata va en la dirección contraria, pero el problema es el
 * mismo: el USDC comprado puede acreditarse mientras el usuario todavía mira la
 * pantalla de pago, y taparla con un prompt de invertir interrumpe una compra en
 * curso. Cuando la pantalla se cierra la marca se apaga y el prompt vuelve a
 * ofrecerse, ahora sí sobre plata que quedó quieta.
 *
 * La prenden los modales de rampa mientras dura el flujo y la consume
 * `useIdleFunds`, que viven en subárboles distintos. Mismo patrón que
 * {@link useAwaitingFundsStore}.
 */
type RampActiveState = {
  /** Hay una rampa en curso con USDC comprometido en la wallet. */
  isRampActive: boolean;
  setRampActive: (active: boolean) => void;
};

export const useRampActiveStore = create<RampActiveState>((set) => ({
  isRampActive: false,
  setRampActive: (isRampActive: boolean) => set({ isRampActive }),
}));

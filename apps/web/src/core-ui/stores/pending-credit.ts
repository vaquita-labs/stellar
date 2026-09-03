import { create } from 'zustand';

/**
 * Hasta cuándo tiene sentido seguir esperando la acreditación de una compra.
 * El proveedor dice "unos minutos, hasta 15"; pasado eso el problema ya no es
 * demora y avisarlo con un saldo que titila no ayuda a nadie.
 */
const MAX_WAIT_MS = 15 * 60 * 1000;

/**
 * La compra de la rampa ya está paga y confirmada —el usuario vio "USDC en
 * camino"— pero el USDC todavía no entró a la wallet. En el medio el saldo del
 * header dice un número que sabemos viejo, así que lo hacemos parpadear: no es
 * un error, es plata en vuelo.
 *
 * La marca la prende `ReceiveFiatRampModal` al llegar a la pantalla de
 * acreditación y la apaga `AutoInvest` cuando la plata llegó y se abre el
 * prompt del vault pasivo. `pendingUntil` es una fecha y no un booleano porque
 * el final feliz puede no llegar nunca (wallet externa, opt-out del prompt, un
 * pago que el proveedor nunca acredita) y un saldo parpadeando para siempre
 * sería peor que uno quieto.
 */
type PendingCreditState = {
  /** Epoch ms hasta el que el saldo parpadea, o `null` si no hay nada en vuelo. */
  pendingUntil: number | null;
  startPendingCredit: () => void;
  clearPendingCredit: () => void;
};

export const usePendingCreditStore = create<PendingCreditState>((set) => ({
  pendingUntil: null,
  // Re-arranca la ventana en cada llamada: dos compras seguidas esperan cada una
  // lo suyo en vez de heredar el vencimiento de la primera.
  startPendingCredit: () => set({ pendingUntil: Date.now() + MAX_WAIT_MS }),
  clearPendingCredit: () => set({ pendingUntil: null }),
}));

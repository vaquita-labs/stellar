import { create } from 'zustand';

/**
 * Marca que el usuario está esperando que le entre USDC: mirando su dirección en
 * el modal "Receive USDC" (`DepositPanel`), o el QR de una compra con moneda
 * local (`ReceiveFiatRampModal`). En los dos casos la plata llega por fuera de la
 * app y no hay ningún evento que nos avise.
 *
 * La consume el poll de plata ociosa (`useIdleFunds`), que vive en otro subárbol:
 * mientras esta marca está prendida re-consulta el balance custodial seguido, y
 * el resto del tiempo no le pega al RPC en loop.
 */
type AwaitingFundsState = {
  isAwaitingFunds: boolean;
  setAwaitingFunds: (awaiting: boolean) => void;
};

export const useAwaitingFundsStore = create<AwaitingFundsState>((set) => ({
  isAwaitingFunds: false,
  setAwaitingFunds: (isAwaitingFunds: boolean) => set({ isAwaitingFunds }),
}));

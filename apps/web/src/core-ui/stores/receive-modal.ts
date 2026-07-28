import { create } from 'zustand';

/**
 * Flag global de si el modal "Receive USDC" (`ReceiveModal`) está abierto. Lo
 * vive `DepositPanel` (dueño del modal) y lo consume el poll de plata ociosa
 * (`useIdleFunds`), que están en subárboles distintos. Sirve para pollear el
 * balance custodial SOLO mientras el usuario mira su dirección esperando que le
 * entre la plata; el resto del tiempo no le pegamos al RPC en loop.
 */
type ReceiveModalState = {
  isReceiveOpen: boolean;
  setReceiveOpen: (open: boolean) => void;
};

export const useReceiveModalStore = create<ReceiveModalState>((set) => ({
  isReceiveOpen: false,
  setReceiveOpen: (isReceiveOpen: boolean) => set({ isReceiveOpen }),
}));

import { create } from 'zustand';

/**
 * Whether Vaquita's approval sheet for a co-signed wallet (`CosignSheet`) is
 * open. It replaces the SDK's cosign modal (`modals.cosign: false` on
 * `PollarProvider`): `CosignHost` opens it when a request appears, and a flow
 * that knows one is coming (a ramp order waiting on this device) calls
 * `openCosign()` itself. A store, not context, so a caller can also wait for it
 * to close (`cosignClosed`) and carry on.
 */
type CosignSheetState = {
  open: boolean;
  openCosign: () => void;
  closeCosign: () => void;
};

export const useCosignStore = create<CosignSheetState>((set) => ({
  open: false,
  openCosign: () => set({ open: true }),
  closeCosign: () => set({ open: false }),
}));

export const openCosign = () => useCosignStore.getState().openCosign();

/** Resolves once the approval sheet closes, approved or not. */
export const cosignClosed = () =>
  new Promise<void>((resolve) => {
    if (!useCosignStore.getState().open) return resolve();
    const unsubscribe = useCosignStore.subscribe((state) => {
      if (state.open) return;
      unsubscribe();
      resolve();
    });
  });

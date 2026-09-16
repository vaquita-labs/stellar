import { create } from 'zustand';

/**
 * Whether any `AppModal` is on screen right now — the app's own barrier against
 * taps that reach the page underneath a modal.
 *
 * React Aria already marks everything outside an open modal `inert`
 * (`useModalOverlay` → `ariaHideOutside(..., { shouldUseInert: true })`), but it
 * releases that the instant `open` turns false, and our sheets keep sliding for
 * another `MODAL_EXIT_MS + 50`. In that window the modal still covers the
 * screen while the page behind it is live again, so one tap over the home
 * action row both dismissed the modal and pressed Deposit underneath. On top of
 * that the backdrop is sized to the VISUAL viewport while the app shell is
 * sized to `window.innerHeight`, so a band at the bottom of an installed PWA
 * can fall outside the overlay entirely — and `.modal__container` is
 * `pointer-events: none`, so a tap there goes straight to the page.
 *
 * Counted rather than flagged: modals stack (a sheet opens over another), and
 * React's development double-mount runs the claim twice before the release.
 */
type ModalOpenState = {
  count: number;
  open: () => void;
  close: () => void;
};

const useModalOpenStore = create<ModalOpenState>((set) => ({
  count: 0,
  open: () => set((state) => ({ count: state.count + 1 })),
  close: () => set((state) => ({ count: Math.max(0, state.count - 1) })),
}));

/**
 * Say a modal is showing, and get back the release. Written for an effect:
 * `useEffect(() => (present ? claimModalOpen() : undefined), [present])`.
 */
export const claimModalOpen = (): (() => void) => {
  useModalOpenStore.getState().open();
  return () => useModalOpenStore.getState().close();
};

export const useIsAnyModalOpen = (): boolean => useModalOpenStore((state) => state.count > 0);

/** Same answer, for listeners bound outside React where a hook cannot be read. */
export const isAnyModalOpen = (): boolean => useModalOpenStore.getState().count > 0;

import { create } from 'zustand';

/**
 * Whether the card screen (`CardModal`, mounted once by `CardHost`) is open.
 * The bottom bar opens it from any route, so it lives in a store rather than
 * in the page that happens to be on screen.
 */
type CardsState = {
  open: boolean;
  openCards: () => void;
  closeCards: () => void;
};

export const useCardsStore = create<CardsState>((set) => ({
  open: false,
  openCards: () => set({ open: true }),
  closeCards: () => set({ open: false }),
}));

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Mocked virtual-card preferences. The Cards section isn't wired to any card
 * issuer yet, but the customization (theme, sticker, frozen state) persists to
 * localStorage so the user's design survives reloads while exploring the UX.
 */
export type CardThemeId = 'vaquita' | 'sky' | 'meadow' | 'berry' | 'night';
export type CardStickerId = 'none' | 'cow' | 'star' | 'fire' | 'rainbow' | 'heart';

type CardsState = {
  theme: CardThemeId;
  sticker: CardStickerId;
  frozen: boolean;
  setTheme: (theme: CardThemeId) => void;
  setSticker: (sticker: CardStickerId) => void;
  toggleFrozen: () => void;
};

export const useCardsStore = create<CardsState>()(
  persist(
    (set, get) => ({
      theme: 'vaquita',
      sticker: 'cow',
      frozen: false,
      setTheme: (theme) => set({ theme }),
      setSticker: (sticker) => set({ sticker }),
      toggleFrozen: () => set({ frozen: !get().frozen }),
    }),
    {
      name: 'vq:cards',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

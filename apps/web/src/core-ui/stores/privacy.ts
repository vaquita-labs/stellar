import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * User-facing privacy preferences. Persisted to localStorage so the choice
 * survives reloads. Reading code should call `useHideBalance()` (or
 * `usePrivacyStore((s) => s.hideBalance)`) and mask any monetary figures when
 * the flag is on — see `maskAmount`.
 */
type PrivacyState = {
  hideBalance: boolean;
  setHideBalance: (value: boolean) => void;
  toggleHideBalance: () => void;
};

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set, get) => ({
      hideBalance: false,
      setHideBalance: (value) => set({ hideBalance: value }),
      toggleHideBalance: () => set({ hideBalance: !get().hideBalance }),
    }),
    {
      name: 'vq:privacy',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const useHideBalance = () => usePrivacyStore((s) => s.hideBalance);

/** Render `••••` when balance hiding is on, otherwise pass through. */
export const maskAmount = (display: string, hide: boolean) =>
  hide ? '••••' : display;

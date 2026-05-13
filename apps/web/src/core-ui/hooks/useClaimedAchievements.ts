'use client';

import { create } from 'zustand';

/**
 * Tracks which achievements the user has *claimed* (i.e. cashed in for coins)
 * during the current session.
 *
 * Intentionally in-memory only — no localStorage, no persist middleware — so
 * the claim flow can be re-tested every reload while we wait for the backend
 * catalog to ship. Swap the store body for a real query/mutation later.
 */
type ClaimedState = {
  claimedIds: Set<string>;
  isClaimed: (id: string) => boolean;
  claim: (id: string) => void;
};

const useClaimedStore = create<ClaimedState>((set, get) => ({
  claimedIds: new Set<string>(),
  isClaimed: (id) => get().claimedIds.has(id),
  claim: (id) =>
    set((state) => {
      if (state.claimedIds.has(id)) return state;
      const next = new Set(state.claimedIds);
      next.add(id);
      return { claimedIds: next };
    }),
}));

export function useClaimedAchievements() {
  const claimedIds = useClaimedStore((s) => s.claimedIds);
  const claim = useClaimedStore((s) => s.claim);
  // `isClaimed` reads from the snapshot above so dependent renders update
  // whenever the set changes — using `get()` directly would skip those.
  const isClaimed = (id: string) => claimedIds.has(id);
  return { claimedIds, isClaimed, claim };
}

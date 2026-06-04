'use client';

import { useMemo } from 'react';
import { useProfileAchievements } from './profile/useProfileAchievements';

/**
 * Server-backed view of which achievements the user has claimed. `claimedIds`
 * derives from `useProfileAchievements` (the `claimedAt` field), so it survives
 * reloads without any client-side state.
 *
 * There is no `claim()` here anymore: badges are always minted on-chain, so the
 * claim happens as step 1 of the mint flow (`useMintBadge`). This hook is now a
 * read-only selector — callers (ProfilePage, AllAchievementsPage, …) only need
 * `isClaimed`.
 */
export function useClaimedAchievements() {
  const { data } = useProfileAchievements();

  const claimedIds = useMemo<Set<string>>(() => {
    const next = new Set<string>();
    for (const a of data?.achievements ?? []) {
      if (a.claimedAt) next.add(a.key);
    }
    return next;
  }, [data?.achievements]);

  const isClaimed = (id: string) => claimedIds.has(id);

  return { claimedIds, isClaimed };
}

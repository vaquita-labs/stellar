'use client';

import { useMemo } from 'react';
import { useClaimAchievement } from './profile/useClaimAchievement';
import { useProfileAchievements } from './profile/useProfileAchievements';

/**
 * Server-backed view of which achievements the user has claimed. The previous
 * implementation kept an in-memory Zustand set so reloads wiped the state;
 * now `claimedIds` derives from `useProfileAchievements` and `claim()` calls
 * the real mutation. The shape of the hook (`{ claimedIds, isClaimed, claim }`)
 * is preserved so existing callers (AchievementModal, BadgeTile, …) keep
 * working without code changes at the call site — only the `claim` return
 * type changed from `void` to `Promise<ClaimAchievementResponseDTO>`.
 */
export function useClaimedAchievements() {
  const { data } = useProfileAchievements();
  const mutation = useClaimAchievement();

  const claimedIds = useMemo<Set<string>>(() => {
    const next = new Set<string>();
    for (const a of data?.achievements ?? []) {
      if (a.claimedAt) next.add(a.key);
    }
    return next;
  }, [data?.achievements]);

  const isClaimed = (id: string) => claimedIds.has(id);

  const claim = (id: string) => mutation.mutateAsync(id);

  return { claimedIds, isClaimed, claim };
}

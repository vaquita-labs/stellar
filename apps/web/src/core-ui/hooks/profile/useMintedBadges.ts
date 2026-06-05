'use client';

import { useMemo } from 'react';
import { useProfileAchievements } from './useProfileAchievements';

/**
 * Server-backed view of which badge types the wallet has minted on-chain.
 * Derives from `useProfileAchievements` (the `minted` field, folded into the
 * badges list), so there's no separate request and it survives reloads.
 */
export const useMintedBadges = () => {
  const { data, ...query } = useProfileAchievements();

  const mintedIds = useMemo<Set<string>>(() => {
    const next = new Set<string>();
    for (const a of data?.achievements ?? []) {
      if (a.minted) next.add(a.key);
    }
    return next;
  }, [data?.achievements]);

  return {
    ...query,
    data: mintedIds,
    isMinted: (badgeType: string) => mintedIds.has(badgeType),
  };
};

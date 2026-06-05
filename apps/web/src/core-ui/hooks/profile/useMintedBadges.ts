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

  // Maps each minted badge to its on-chain tx hash so callers can link an
  // already-minted badge to stellar.expert without re-running the mint flow.
  const mintTxByType = useMemo<Map<string, string>>(() => {
    const next = new Map<string, string>();
    for (const a of data?.achievements ?? []) {
      if (a.minted && a.transactionHash) next.set(a.key, a.transactionHash);
    }
    return next;
  }, [data?.achievements]);

  return {
    ...query,
    data: mintedIds,
    isMinted: (badgeType: string) => mintedIds.has(badgeType),
    getMintTxHash: (badgeType: string) => mintTxByType.get(badgeType) ?? null,
  };
};

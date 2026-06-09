'use client';

import { getJson } from '@/core-ui/api/http';
import { useConfigStore } from '@/core-ui/stores';
import type { FriendDTO, FriendListResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

export type FollowListKind = 'following' | 'followers';

/** Shared query key so mutations (useToggleFollow) can invalidate these lists. */
export const followListKey = (
  kind: FollowListKind,
  networkName: string | undefined,
  walletAddress: string | undefined,
) => ['profile', networkName, walletAddress, 'follow-list', kind] as const;

/**
 * The viewer's followers or following as full `FriendDTO`s, for the /profile
 * follow modal. `enabled` lets the caller defer the fetch until the modal opens.
 */
export const useFollowList = (kind: FollowListKind, enabled = true) => {
  const { network, walletAddress } = useConfigStore();

  return useQuery<FriendDTO[]>({
    queryKey: followListKey(kind, network?.networkName, walletAddress),
    queryFn: async () => {
      const data = await getJson<FriendListResponseDTO>(
        `/follows/wallet/${walletAddress}/${kind}/list`,
      );
      return data?.results ?? [];
    },
    enabled: !!network?.networkName && !!walletAddress && enabled,
    // Same as useFollowCounts: other users mutate this list (someone follows
    // you), so the global never-stale default would show a persisted snapshot
    // forever. staleTime: 0 also makes the `enabled` flip (modal open) refetch
    // instead of trusting the cached entry.
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

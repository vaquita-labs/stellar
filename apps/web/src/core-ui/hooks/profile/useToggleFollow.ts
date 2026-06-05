'use client';

import { delJson, postJson } from '@/core-ui/api/http';
import { useConfigStore } from '@/core-ui/stores';
import type { FollowResponseDTO, FriendSearchResponseDTO } from '@/core-ui/types';
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';

type ToggleVars = { targetWallet: string; isFollowing: boolean };
type ToggleContext = { snapshots: [QueryKey, FriendSearchResponseDTO | undefined][] };

/**
 * Follow / unfollow a vaquero. `isFollowing` is the CURRENT state, so the
 * mutation toggles it (following → DELETE, not following → POST). Optimistically
 * flips `isFollowing` and nudges the follower count across every cached search
 * page, rolling back on error and reconciling on settle.
 */
export const useToggleFollow = () => {
  const queryClient = useQueryClient();
  const { network, walletAddress } = useConfigStore();
  const networkName = network?.networkName ?? '';
  const searchKey = ['profile', networkName, walletAddress, 'friends-search'] as const;

  return useMutation<FollowResponseDTO | null, Error, ToggleVars, ToggleContext>({
    mutationFn: async ({ targetWallet, isFollowing }) => {
      if (!walletAddress) throw new Error('No connected wallet');
      // 409 (already following) is an expected no-op on the POST path.
      return isFollowing
        ? delJson<FollowResponseDTO>(`/follows/wallet/${walletAddress}/follow/${targetWallet}`)
        : postJson<FollowResponseDTO>(`/follows/wallet/${walletAddress}/follow`, { targetWallet }, [409]);
    },
    onMutate: async ({ targetWallet, isFollowing }) => {
      await queryClient.cancelQueries({ queryKey: searchKey });
      const snapshots = queryClient.getQueriesData<FriendSearchResponseDTO>({ queryKey: searchKey });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData<FriendSearchResponseDTO>(key, {
          ...data,
          results: data.results.map((f) =>
            f.walletAddress === targetWallet
              ? {
                  ...f,
                  isFollowing: !isFollowing,
                  followers: Math.max(0, f.followers + (isFollowing ? -1 : 1)),
                }
              : f,
          ),
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: searchKey });
    },
  });
};

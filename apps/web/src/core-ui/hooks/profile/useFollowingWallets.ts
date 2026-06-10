'use client';

import { getJson } from '@/core-ui/api/http';
import { useConfigStore } from '@/core-ui/stores';
import type { FollowingWalletsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

/** Shared query key so mutations (useToggleFollow) can patch this cache. */
export const followingWalletsKey = (
  networkName: string | undefined,
  walletAddress: string | undefined,
) => ['profile', networkName, walletAddress, 'following-wallets'] as const;

/**
 * Lowercased wallet addresses the current viewer follows, returned as a `Set`
 * for O(1) lookups. Seeds the per-row Follow buttons (leaderboard, etc.) so
 * their state is correct on first paint and survives a reload.
 */
export const useFollowingWallets = () => {
  const { network, walletAddress } = useConfigStore();

  return useQuery({
    queryKey: followingWalletsKey(network?.networkName, walletAddress),
    queryFn: async () => {
      const data = await getJson<FollowingWalletsResponseDTO>(
        `/follows/wallet/${walletAddress}/following`,
      );
      return (data?.following ?? []).map((w) => w.toLowerCase());
    },
    enabled: !!network?.networkName && !!walletAddress,
    // Cache holds the raw lowercased array; consumers get a Set.
    select: (wallets) => new Set(wallets),
  });
};

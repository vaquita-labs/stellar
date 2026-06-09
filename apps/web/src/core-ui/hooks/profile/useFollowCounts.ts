'use client';

import { getJson } from '@/core-ui/api/http';
import { useConfigStore } from '@/core-ui/stores';
import type { FollowCountsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

/** Shared query key so mutations (useToggleFollow) can patch this cache. */
export const followCountsKey = (
  networkName: string | undefined,
  walletAddress: string | undefined,
) => ['profile', networkName, walletAddress, 'follow-counts'] as const;

/**
 * Following + follower counts for the current viewer, shown on the /profile
 * stats row.
 */
export const useFollowCounts = () => {
  const { network, walletAddress } = useConfigStore();

  return useQuery<FollowCountsResponseDTO>({
    queryKey: followCountsKey(network?.networkName, walletAddress),
    queryFn: async () => {
      const data = await getJson<FollowCountsResponseDTO>(
        `/follows/wallet/${walletAddress}/counts`,
      );
      return (
        data ?? {
          networkName: network?.networkName ?? '',
          walletAddress: walletAddress ?? '',
          following: 0,
          followers: 0,
        }
      );
    },
    enabled: !!network?.networkName && !!walletAddress,
  });
};

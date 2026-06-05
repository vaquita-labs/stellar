'use client';

import { getJson } from '@/core-ui/api/http';
import { useConfigStore } from '@/core-ui/stores';
import type { FriendSearchResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

/**
 * Friend-search results for the current viewer. An empty `query` returns the
 * newest profiles (the "Popular vaqueros" default). Keeps the previous page
 * visible while a new query loads so the list doesn't flash empty as the user
 * types.
 */
export const useSearchFriends = (query: string) => {
  const { network, walletAddress } = useConfigStore();
  const q = query.trim();

  return useQuery<FriendSearchResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'friends-search', q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const data = await getJson<FriendSearchResponseDTO>(
        `/follows/wallet/${walletAddress}/search?${params.toString()}`,
      );
      return data ?? { networkName: network?.networkName ?? '', query: q, results: [] };
    },
    enabled: !!network?.networkName && !!walletAddress,
    placeholderData: (prev) => prev,
  });
};

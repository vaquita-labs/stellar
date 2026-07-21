'use client';

import { getJson } from '@/core-ui/api/http';
import { useConfigStore } from '@/core-ui/stores';
import type { FriendSearchResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

/** Mirrors the API: shorter queries are refused server-side, so don't ask. */
export const MIN_SEARCH_LENGTH = 2;

/** Server-side page size. The API caps it at 50 regardless. */
const SEARCH_LIMIT = 20;

/**
 * Friend-search results for the current viewer. Nothing is fetched until the
 * query reaches MIN_SEARCH_LENGTH, so the page shows no list until the user
 * actually searches. The previous page stays visible while a new query loads
 * (the caller compares `data.query` with the current term to tell stale results
 * apart), which avoids a blank flash between searches.
 */
export const useSearchFriends = (query: string) => {
  const { network, walletAddress } = useConfigStore();
  const q = query.trim();

  return useQuery<FriendSearchResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'friends-search', q],
    queryFn: async () => {
      const params = new URLSearchParams({ q, limit: String(SEARCH_LIMIT) });
      const data = await getJson<FriendSearchResponseDTO>(`/follows/wallet/${walletAddress}/search?${params.toString()}`);
      return data ?? { networkName: network?.networkName ?? '', query: q, results: [] };
    },
    enabled: !!network?.networkName && !!walletAddress && q.length >= MIN_SEARCH_LENGTH,
    placeholderData: (prev) => prev,
    // Results go stale fast (people change their handle, you follow someone in
    // another tab) but re-typing the same term inside a session should hit cache.
    staleTime: 30_000,
  });
};

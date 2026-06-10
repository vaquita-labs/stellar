'use client';

import { getJson } from '@/core-ui/api/http';
import { useConfigStore } from '@/core-ui/stores';
import type { FriendSuggestionsResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';

/**
 * Friend suggestions for the current viewer (friends-of-friends, random fill for
 * the rest). Powers the "Friend suggestions" rail on /profile/friends.
 */
export const useFriendSuggestions = (limit = 5) => {
  const { network, walletAddress } = useConfigStore();

  return useQuery<FriendSuggestionsResponseDTO>({
    queryKey: ['profile', network?.networkName, walletAddress, 'friends-suggestions', limit],
    queryFn: async () => {
      const data = await getJson<FriendSuggestionsResponseDTO>(
        `/follows/wallet/${walletAddress}/suggestions?limit=${limit}`,
      );
      return data ?? { networkName: network?.networkName ?? '', suggestions: [] };
    },
    enabled: !!network?.networkName && !!walletAddress,
    // Las sugerencias cambian cuando entran otros usuarios: refetch al montar.
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

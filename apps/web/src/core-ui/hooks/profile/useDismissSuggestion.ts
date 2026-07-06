'use client';

import { postJson } from '@/core-ui/api/http';
import { useConfigStore } from '@/core-ui/stores';
import type { FriendSuggestionsResponseDTO, SuggestionDismissResponseDTO } from '@/core-ui/types';
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';

type DismissContext = {
  snapshots: [QueryKey, FriendSuggestionsResponseDTO | undefined][];
};

/**
 * "Not interested" on a Friend-suggestions card. Optimistically removes the
 * card from every cached rail, persists the dismissal server-side (so it
 * survives a reload), rolls back on error, and refetches on settle so the rail
 * backfills with a fresh suggestion.
 */
export const useDismissSuggestion = () => {
  const queryClient = useQueryClient();
  const { network, walletAddress } = useConfigStore();
  // Prefix of useFriendSuggestions' key (which also carries `limit` at the end).
  const suggestionsKey = ['profile', network?.networkName ?? '', walletAddress, 'friends-suggestions'] as const;

  return useMutation<SuggestionDismissResponseDTO | null, Error, string, DismissContext>({
    mutationFn: async (targetWallet) => {
      if (!walletAddress) throw new Error('No connected wallet');
      return postJson<SuggestionDismissResponseDTO>(
        `/follows/wallet/${walletAddress}/suggestions/dismiss`,
        { targetWallet },
      );
    },
    onMutate: async (targetWallet) => {
      await queryClient.cancelQueries({ queryKey: suggestionsKey });

      const snapshots = queryClient.getQueriesData<FriendSuggestionsResponseDTO>({ queryKey: suggestionsKey });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData<FriendSuggestionsResponseDTO>(key, {
          ...data,
          suggestions: data.suggestions.filter((s) => s.walletAddress !== targetWallet),
        });
      }

      return { snapshots };
    },
    onError: (_err, _targetWallet, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: suggestionsKey });
    },
  });
};

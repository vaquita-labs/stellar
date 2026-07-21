import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';

export const EXPLORE_PAGE_SIZE = 10;

/** One discoverable vaquero. No position and no score — the feed isn't ranked. */
export interface ExploreProfileDTO {
  walletAddress: string;
  nickname: string;
  avatarUrl: string;
  badges: number;
  streak: number;
  experience: number;
  coins: number;
}

export interface ExplorePageDTO {
  rows: ExploreProfileDTO[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export const exploreQueryKey = (
  networkName: string | undefined,
  viewerWallet: string,
  seed: string,
) => ['explore', 'network', networkName, { viewerWallet, seed }] as const;

/**
 * A seed pins the shuffle for as long as the screen is mounted, so paging never
 * repeats or skips someone. Leaving and coming back mounts a new one, which is
 * what makes the feed feel fresh on every visit.
 */
export const useExploreSeed = () => {
  const [seed] = useState(() => Math.random().toString(36).slice(2));
  return seed;
};

const toRow = (row: Partial<ExploreProfileDTO> | undefined): ExploreProfileDTO => ({
  walletAddress: row?.walletAddress ?? '',
  nickname: row?.nickname ?? '',
  avatarUrl: row?.avatarUrl ?? '',
  badges: row?.badges ?? 0,
  streak: row?.streak ?? 0,
  experience: row?.experience ?? 0,
  coins: row?.coins ?? 0,
});

/**
 * Infinite discovery feed. The API excludes the viewer and everyone they follow
 * before slicing, so pages always come back full of people worth showing — no
 * client-side filtering that would leave short or empty pages.
 */
export const useExploreData = ({ seed }: { seed: string }) => {
  const { network, walletAddress } = useConfigStore();
  const viewerWallet = walletAddress ?? '';

  return useInfiniteQuery({
    queryKey: exploreQueryKey(network?.networkName, viewerWallet, seed),
    queryFn: async ({ pageParam }): Promise<ExplorePageDTO> => {
      const url = new URL(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/explore/wallet/${encodeURIComponent(viewerWallet)}`,
      );
      url.searchParams.set('seed', seed);
      url.searchParams.set('limit', String(EXPLORE_PAGE_SIZE));
      url.searchParams.set('offset', String(pageParam));

      const response = await fetch(url);
      const data = await response.json();
      const page = data?.data;

      return {
        rows: (page?.rows ?? []).map(toRow),
        total: page?.total ?? 0,
        limit: page?.limit ?? EXPLORE_PAGE_SIZE,
        offset: page?.offset ?? 0,
        hasMore: page?.hasMore ?? false,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.rows.length : undefined,
    placeholderData: keepPreviousData,
    enabled: !!network?.networkName && !!viewerWallet,
    // The feed is a browsing surface, not a source of truth: refetching it on
    // every focus would reshuffle nothing (the seed is pinned) but would keep
    // re-fetching every loaded page for no visible gain.
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  });
};

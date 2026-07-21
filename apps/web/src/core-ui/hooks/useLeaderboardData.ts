import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { LeaderboardResponseDTO } from '@/core-ui/types';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { ONE_MINUTE } from '../config/constants';

export const LEADERBOARD_PAGE_SIZE = 20;

export type LeaderboardSortKey = 'rank' | 'level' | 'streak' | 'badges';
export type LeaderboardSortDirection = 'asc' | 'desc';

export interface LeaderboardViewParams {
  cycle?: string;
  search?: string;
  sort?: LeaderboardSortKey;
  direction?: LeaderboardSortDirection;
  /** Row offset the feed starts at. Defaults to 0 (the top of the board); set
   *  it to jump straight to a deep page — see `me`/`meViewIndex` below. */
  anchorOffset?: number;
}

export interface LeaderboardPageDTO {
  rows: LeaderboardResponseDTO[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  /** The viewer's own row (true rank, independent of the search/sort view),
   *  or null when the viewer isn't on the board / isn't connected. */
  me: LeaderboardResponseDTO | null;
  /** 0-based index of the viewer's row *in this view*, or null when it isn't
   *  in it. Unlike `me.position` (a true rank) this is the index the offset
   *  maths works on, so it stays correct under any sort/search. */
  meViewIndex: number | null;
}

/** Prefix shared by every leaderboard view (any cycle/search/sort) — use it to
 *  match all cached leaderboard queries at once. */
export const leaderboardQueryPrefix = (networkName: string | undefined) =>
  ['leaderboard', 'network', networkName] as const;

export const leaderboardQueryKey = (
  networkName: string | undefined,
  {
    cycle = 'current',
    search = '',
    sort = 'rank',
    direction = 'desc',
    anchorOffset = 0,
  }: LeaderboardViewParams = {},
  // Part of the key so switching wallets can't serve another viewer's `me` row.
  viewerWallet = '',
) =>
  [
    ...leaderboardQueryPrefix(networkName),
    cycle,
    // The anchor belongs in the key: a feed starting at row 999.980 is a
    // different list from the one starting at row 0, not a page of it.
    { search, sort, direction, viewerWallet, anchorOffset },
  ] as const;

const toLeaderboardRow = (row: LeaderboardResponseDTO): LeaderboardResponseDTO => ({
  position: row?.position ?? 0,
  walletAddress: row?.walletAddress ?? '',
  nickname: row?.nickname ?? '',
  avatarUrl: row?.avatarUrl ?? '',
  badges: row?.badges ?? 0,
  streak: row?.streak ?? 0,
  experience: row?.experience ?? 0,
  coins: row?.coins ?? 0,
  score: row?.score ?? 0,
  activeAmount: row?.activeAmount ?? 0,
  cycleId: row?.cycleId ?? 0,
  cycleStart: row?.cycleStart ?? 0,
  cycleEnd: row?.cycleEnd ?? 0,
  cycleStatus: row?.cycleStatus ?? 'current',
});

/**
 * Infinite-scroll leaderboard feed. The API paginates server-side (search +
 * sort included, so every loaded page is globally consistent) and each page
 * reports `hasMore`/`offset` for the next fetch.
 *
 * `anchorOffset` starts the feed at an arbitrary row instead of the top. The
 * API materialises the whole board in memory before slicing, so a deep offset
 * costs the same as offset 0 — that's what makes "jump to my position" one
 * request rather than one per page in between.
 */
export const useLeaderboardData = (params: LeaderboardViewParams = {}) => {
  const { network, walletAddress } = useConfigStore();
  const {
    cycle = 'current',
    search = '',
    sort = 'rank',
    direction = 'desc',
    anchorOffset = 0,
  } = params;
  const viewerWallet = walletAddress ?? '';

  return useInfiniteQuery({
    queryKey: leaderboardQueryKey(
      network?.networkName,
      { cycle, search, sort, direction, anchorOffset },
      viewerWallet,
    ),
    queryFn: async ({ pageParam }): Promise<LeaderboardPageDTO> => {
      const url = new URL(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/leaderboard`);
      url.searchParams.set('cycle', cycle);
      url.searchParams.set('limit', String(LEADERBOARD_PAGE_SIZE));
      url.searchParams.set('offset', String(pageParam));
      if (search) url.searchParams.set('search', search);
      if (sort !== 'rank') url.searchParams.set('sort', sort);
      if (direction !== 'desc') url.searchParams.set('direction', direction);
      // Ask the API for the viewer's own row too, so the page can pin "you are
      // #N" without paging the feed down to that position.
      if (viewerWallet) url.searchParams.set('me', viewerWallet);

      const response = await fetch(url);
      const data = await response.json();
      const page = data?.data;

      return {
        rows: (page?.rows ?? []).map(toLeaderboardRow),
        total: page?.total ?? 0,
        limit: page?.limit ?? LEADERBOARD_PAGE_SIZE,
        offset: page?.offset ?? 0,
        hasMore: page?.hasMore ?? false,
        me: page?.me ? toLeaderboardRow(page.me) : null,
        meViewIndex: typeof page?.meViewIndex === 'number' ? page.meViewIndex : null,
      };
    },
    initialPageParam: anchorOffset,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.rows.length : undefined,
    // Switching search/sort/direction is a new query key; keep showing the
    // previous view (slightly dimmed by the page) instead of flashing
    // skeletons while the new one loads.
    placeholderData: keepPreviousData,
    // Note: on an infinite query this refetches every loaded page in sequence,
    // which keeps deep scrolls consistent at the cost of one request per page.
    refetchInterval: ONE_MINUTE * 5,
    enabled: !!network?.networkName,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
};

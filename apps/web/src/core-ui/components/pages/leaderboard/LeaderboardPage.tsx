'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LeaderboardResponseDTO } from '@/core-ui/types';
import { useLeaderboardData, useProfileData } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { PageLayout } from '../../molecules';
import {
  LeaderboardCard,
  LeaderboardCardData,
  LeaderboardCardSkeleton,
  getLeaderboardUsername,
} from './LeaderboardCard';
import { LeaderboardSubHeader, SortDirection, SortKey } from './LeaderboardSubHeader';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 350;

/* ------------------------------------------------------------------ */
/* Debounced value                                                     */
/* ------------------------------------------------------------------ */

/** Debounce the search text before it becomes a server query param, so we
 *  don't fire one request per keystroke. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function LoadingState() {
  const { t } = useTranslation();
  return (
    <ul
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label={t('leaderboard.loadingLabel', 'Loading leaderboard')}
    >
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <li key={i}>
          <LeaderboardCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-black/10 bg-white p-8 text-center">
      <Image src="/vaquita/error.svg" alt="" width={140} height={140} />
      <p className="text-base font-extrabold text-black">
        {t('leaderboard.empty.title', 'No vaqueros on the board yet')}
      </p>
      <p className="text-xs text-gray-500 max-w-xs">
        {t(
          'leaderboard.empty.description',
          "Be the first to climb the ranks — start a deposit streak and you'll show up here."
        )}
      </p>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 text-center">
      <p className="text-sm font-extrabold text-black">
        {t('leaderboard.noResults.title', 'No vaqueros match “{{query}}”', { query })}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {t('leaderboard.noResults.description', 'Try a different username or clear the search.')}
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-3xl border border-red-300 bg-red-50 p-6 text-center">
      <p className="text-sm font-extrabold text-red-700">
        {t('leaderboard.error.title', "Couldn't load the leaderboard")}
      </p>
      <p className="mt-1 text-xs text-red-700/80 break-words">{message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Infinite-scroll sentinel                                            */
/* ------------------------------------------------------------------ */

/** Invisible marker below the feed — when it scrolls into view (with a
 *  viewport of margin to prefetch early), ask for the next page. */
function LoadMoreSentinel({
  onVisible,
  disabled,
}: {
  onVisible: () => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    if (disabled) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisibleRef.current();
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled]);

  return <div ref={ref} aria-hidden className="h-px" />;
}

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

function LeaderboardFeed({
  rows,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  rows: LeaderboardCardData[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.walletAddress}>
            <LeaderboardCard user={row} />
          </li>
        ))}
        {isFetchingNextPage && (
          <li aria-label={t('leaderboard.loadingMore', 'Loading more vaqueros')}>
            <LeaderboardCardSkeleton />
          </li>
        )}
      </ul>
      <LoadMoreSentinel
        onVisible={onLoadMore}
        disabled={!hasNextPage || isFetchingNextPage}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Row builder                                                         */
/* ------------------------------------------------------------------ */

function useLeaderboardRows(rows: LeaderboardResponseDTO[]): LeaderboardCardData[] {
  const { walletAddress: currentUserWallet } = useConfigStore();

  return useMemo(() => {
    return rows.map((row) => {
      const isCurrentUser =
        !!currentUserWallet &&
        currentUserWallet.toLowerCase() === row.walletAddress.toLowerCase();

      // Lightweight "level" derivation from the real XP the API now ships per
      // profile: every 100 XP = +1 level, minimum level 1. Coerce the gamification
      // fields here so a stale react-query cache from before these fields existed
      // (global staleTime is Infinity) can't render the literal text "undefined"
      // in a card before the background refetch lands.
      const level = Math.max(1, Math.floor((row.experience ?? 0) / 100) + 1);

      return {
        position: row.position,
        walletAddress: row.walletAddress,
        username: getLeaderboardUsername(row.nickname, row.walletAddress),
        avatarUrl: row.avatarUrl,
        level,
        streak: row.streak ?? 0,
        badges: row.badges ?? 0,
        // TODO: Replace with real likes and comments once the API ships them.
        likesSeed: 0,
        commentsSeed: 0,
        isCurrentUser,
      };
    });
  }, [rows, currentUserWallet]);
}

/* ------------------------------------------------------------------ */
/* Current-user identity (for the share modal)                         */
/* ------------------------------------------------------------------ */

function useCurrentUserIdentity() {
  const { t } = useTranslation();
  const { walletAddress } = useConfigStore();
  const { data: profileData } = useProfileData();

  const displayName = useMemo(() => {
    const nickname = profileData?.nickname?.trim();
    if (nickname) return nickname;
    const full = profileData?.fullName?.trim();
    if (full) return full;
    if (walletAddress)
      return t('leaderboard.vaqueroNamed', 'Vaquero {{tail}}', {
        tail: walletAddress.slice(-4).toUpperCase(),
      });
    return t('leaderboard.vaquero', 'Vaquero');
  }, [profileData?.nickname, profileData?.fullName, walletAddress, t]);

  const handle = useMemo(
    () => getLeaderboardUsername(profileData?.nickname, walletAddress ?? ''),
    [profileData?.nickname, walletAddress]
  );

  return { displayName, handle };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export const LeaderboardPage = () => {
  const { t } = useTranslation();

  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);

  // Search + sort + pagination all happen server-side now: each view is its
  // own infinite query, and pages arrive already filtered/ordered globally.
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
    fetchNextPage,
  } = useLeaderboardData({ search: debouncedQuery, sort: sortKey, direction });

  const leaderboardRows = useMemo(
    () => data?.pages.flatMap((page) => page.rows) ?? [],
    [data]
  );
  const rankedRows = useLeaderboardRows(leaderboardRows);

  const { displayName, handle } = useCurrentUserIdentity();

  const renderFeed = () => {
    if (isLoading) return <LoadingState />;
    if (error) return <ErrorState message={`${error}`} />;
    if (rankedRows.length === 0) {
      return debouncedQuery ? <NoResults query={debouncedQuery} /> : <EmptyState />;
    }
    return (
      // While a new view (search/sort change) resolves, the previous list stays
      // visible but dimmed; the sentinel is disabled so we don't page the
      // placeholder view by accident.
      <div className={isPlaceholderData ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
        <LeaderboardFeed
          rows={rankedRows}
          hasNextPage={!!hasNextPage && !isPlaceholderData}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
      </div>
    );
  };

  return (
    <PageLayout
      title={t('leaderboard.title', 'Leaderboard')}
      contentClassName="!gap-3"
    >
      <LeaderboardSubHeader
        query={query}
        onQueryChange={setQuery}
        sortKey={sortKey}
        onSortChange={setSortKey}
        direction={direction}
        onDirectionChange={setDirection}
      />
      {renderFeed()}
    </PageLayout>
  );
};

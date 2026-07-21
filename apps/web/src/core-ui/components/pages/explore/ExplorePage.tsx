'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExploreProfileDTO, useExploreData, useExploreSeed } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { LoadMoreSentinel, PageLayout } from '../../molecules';
import {
  LeaderboardCard,
  LeaderboardCardData,
  LeaderboardCardSkeleton,
  getLeaderboardUsername,
} from '../leaderboard/LeaderboardCard';

const SKELETON_ROWS = 2;

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function LoadingState() {
  const { t } = useTranslation();
  return (
    <ul
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label={t('explore.loadingLabel', 'Loading vaqueros')}
    >
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <li key={i}>
          <LeaderboardCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

/** Reached when the viewer already follows everyone left in the pool — which is
 *  a good outcome, not an error, so it reads as one. */
function CaughtUpState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-black/10 bg-white p-8 text-center">
      <Image src="/vaquita/vaquita_isotipo.svg" alt="" width={96} height={96} />
      <p className="text-base font-extrabold text-black">
        {t('explore.caughtUp.title', "You've met everyone")}
      </p>
      <p className="text-xs text-gray-500 max-w-xs">
        {t(
          'explore.caughtUp.description',
          'You already follow every vaquero around. Come back later — new worlds show up all the time.'
        )}
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-3xl border border-red-300 bg-red-50 p-6 text-center">
      <p className="text-sm font-extrabold text-red-700">
        {t('explore.error.title', "Couldn't load vaqueros")}
      </p>
      <p className="mt-1 text-xs text-red-700/80 break-words">{message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row builder                                                         */
/* ------------------------------------------------------------------ */

/** Adapts a discovery row to the shared card shape. `position` is filled with 0
 *  and never rendered (the card is mounted with `showPosition={false}`) — this
 *  feed has no ranking. */
function useExploreCards(rows: ExploreProfileDTO[]): LeaderboardCardData[] {
  const { walletAddress } = useConfigStore();

  return useMemo(
    () =>
      rows.map((row) => ({
        position: 0,
        walletAddress: row.walletAddress,
        nickname: (row.nickname ?? '').trim(),
        username: getLeaderboardUsername(row.nickname, row.walletAddress),
        avatarConfig: row.avatarConfig,
        level: Math.max(1, Math.floor((row.experience ?? 0) / 100) + 1),
        streak: row.streak ?? 0,
        badges: row.badges ?? 0,
        coins: row.coins ?? 0,
        experience: row.experience ?? 0,
        mapLikes: row.mapLikes ?? 0,
        commentsSeed: 0,
        // The API already excludes the viewer, so no row here is ever "you".
        isCurrentUser:
          !!walletAddress && walletAddress.toLowerCase() === row.walletAddress.toLowerCase(),
      })),
    [rows, walletAddress]
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/**
 * Discovery feed: an endless, shuffled stream of other vaqueros' worlds to look
 * at and follow. Not a leaderboard — no positions, no sorting, nothing to climb.
 * The viewer and everyone they already follow are filtered out server-side.
 */
export const ExplorePage = () => {
  const { t } = useTranslation();

  // Pinned for the life of the screen: the order has to stay put while paging.
  const seed = useExploreSeed();

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage } =
    useExploreData({ seed });

  const rows = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);
  const cards = useExploreCards(rows);

  const renderFeed = () => {
    if (isLoading) return <LoadingState />;
    if (error) return <ErrorState message={`${error}`} />;
    if (cards.length === 0) return <CaughtUpState />;
    return (
      <div className={isPlaceholderData ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
        <ul className="flex flex-col gap-3">
          {cards.map((card) => (
            <li key={card.walletAddress}>
              <LeaderboardCard user={card} showPosition={false} />
            </li>
          ))}
          {isFetchingNextPage && (
            <li aria-label={t('explore.loadingMore', 'Loading more vaqueros')}>
              <LeaderboardCardSkeleton />
            </li>
          )}
        </ul>
        <LoadMoreSentinel
          onVisible={fetchNextPage}
          disabled={!hasNextPage || isFetchingNextPage || isPlaceholderData}
        />
      </div>
    );
  };

  return (
    <PageLayout
      title={t('explore.title', 'Explore')}
      backHref="/home"
      contentClassName="!gap-3"
      stickyHeader
    >
      {renderFeed()}
    </PageLayout>
  );
};

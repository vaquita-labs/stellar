'use client';

import Image from 'next/image';
import { useDeferredValue, useMemo, useState } from 'react';
import { ProfileAverageResponseDTO } from '@/core-ui/types';
import {
  useProfileData,
  useProfileExperience,
  useProfilesByAverageDepositsData,
  useProfileStreak,
} from '../../../hooks';
import { useNetworkConfigStore } from '../../../stores';
import { PageLayout } from '../../molecules';
import { ShareProfileQrButton } from '../profile/ShareProfileQrButton';
import {
  LeaderboardCard,
  LeaderboardCardData,
  LeaderboardCardSkeleton,
  getLeaderboardUsername,
} from './LeaderboardCard';
import { LeaderboardSubHeader, SortDirection, SortKey } from './LeaderboardSubHeader';
import { derivePlaceholderUserStats } from './userStatsPlaceholder';

const SKELETON_ROWS = 3;

/* ------------------------------------------------------------------ */
/* Ranking + filtering                                                 */
/* ------------------------------------------------------------------ */

/**
 * Default ordering — by internal average deposits. Never shown in UI; once
 * the backend ranks by XP this collapses to `(a, b) => b.xp - a.xp`.
 */
function defaultRank(profiles: ProfileAverageResponseDTO[]): ProfileAverageResponseDTO[] {
  return [...profiles].sort((a, b) => {
    const avgA = a.count !== 0 ? a.totalSums / a.count : 0;
    const avgB = b.count !== 0 ? b.totalSums / b.count : 0;
    return avgB - avgA;
  });
}

/** Apply the user-selected sort + direction to a list of cards.
 *  Rows arrive already in descending rank order, so `rank + desc` is a no-op
 *  and `rank + asc` simply reverses the list. */
function sortRows(
  rows: LeaderboardCardData[],
  key: SortKey,
  direction: SortDirection
): LeaderboardCardData[] {
  if (key === 'rank') {
    return direction === 'desc' ? rows : [...rows].reverse();
  }
  const accessor: Record<Exclude<SortKey, 'rank'>, (r: LeaderboardCardData) => number> = {
    level: (r) => r.level,
    streak: (r) => r.streak,
    badges: (r) => r.badges,
  };
  const get = accessor[key];
  return [...rows].sort((a, b) =>
    direction === 'desc' ? get(b) - get(a) : get(a) - get(b)
  );
}

/** Case-insensitive substring match on the username. */
function filterRows(rows: LeaderboardCardData[], query: string): LeaderboardCardData[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.username.toLowerCase().includes(q));
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function LoadingState() {
  return (
    <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Loading leaderboard">
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <li key={i}>
          <LeaderboardCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-black/10 bg-white p-8 text-center">
      <Image src="/vaquita/error.svg" alt="" width={140} height={140} />
      <p className="text-base font-extrabold text-black">No vaqueros on the board yet</p>
      <p className="text-xs text-gray-500 max-w-xs">
        Be the first to climb the ranks — start a deposit streak and you&apos;ll show up here.
      </p>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 text-center">
      <p className="text-sm font-extrabold text-black">No vaqueros match &ldquo;{query}&rdquo;</p>
      <p className="mt-1 text-xs text-gray-500">Try a different username or clear the search.</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-red-300 bg-red-50 p-6 text-center">
      <p className="text-sm font-extrabold text-red-700">Couldn&apos;t load the leaderboard</p>
      <p className="mt-1 text-xs text-red-700/80 break-words">{message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

function LeaderboardFeed({ rows }: { rows: LeaderboardCardData[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.walletAddress}>
          <LeaderboardCard user={row} />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Row builder                                                         */
/* ------------------------------------------------------------------ */

function useLeaderboardRows(profiles: ProfileAverageResponseDTO[]): LeaderboardCardData[] {
  const { walletAddress: currentUserWallet } = useNetworkConfigStore();
  // Real stats for the current user only — every other row falls back to
  // the deterministic placeholder until the API ships per-user XP/streak.
  const { data: streakData } = useProfileStreak();
  const { data: experienceData } = useProfileExperience();

  return useMemo(() => {
    const ranked = defaultRank(profiles);
    return ranked.map((profile, index) => {
      const isCurrentUser =
        !!currentUserWallet &&
        currentUserWallet.toLowerCase() === profile.walletAddress.toLowerCase();

      const placeholder = derivePlaceholderUserStats(profile.walletAddress);

      const realStreak = isCurrentUser
        ? (streakData?.yesterdayStreak ?? 0) + (streakData?.todayStreak ? 1 : 0)
        : null;
      const realExperience = isCurrentUser ? experienceData?.experience ?? null : null;
      // Lightweight "level" derivation from XP: every 100 XP = +1 level.
      const realLevel =
        realExperience !== null ? Math.max(1, Math.floor(realExperience / 100) + 1) : null;

      return {
        position: index + 1,
        walletAddress: profile.walletAddress,
        username: getLeaderboardUsername(profile.nickname, profile.walletAddress),
        level: realLevel ?? placeholder.level,
        streak: realStreak ?? placeholder.streak,
        badges: placeholder.badges,
        // TODO: Replace with real likes and comments once the API ships thems
        likesSeed: 0,
        commentsSeed: 0,
        isCurrentUser,
      };
    });
  }, [profiles, currentUserWallet, streakData, experienceData]);
}

/* ------------------------------------------------------------------ */
/* Current-user identity (for the share modal)                         */
/* ------------------------------------------------------------------ */

function useCurrentUserIdentity() {
  const { walletAddress } = useNetworkConfigStore();
  const { data: profileData } = useProfileData();

  const displayName = useMemo(() => {
    const nickname = profileData?.nickname?.trim();
    if (nickname) return nickname;
    const full = profileData?.fullName?.trim();
    if (full) return full;
    if (walletAddress) return `Vaquero ${walletAddress.slice(-4).toUpperCase()}`;
    return 'Vaquero';
  }, [profileData?.nickname, profileData?.fullName, walletAddress]);

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
  const { data: profiles = [], isLoading, error } = useProfilesByAverageDepositsData();
  const rankedRows = useLeaderboardRows(profiles);

  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const { displayName, handle } = useCurrentUserIdentity();

  const visibleRows = useMemo(
    () => filterRows(sortRows(rankedRows, sortKey, direction), deferredQuery),
    [rankedRows, sortKey, direction, deferredQuery]
  );

  const renderFeed = () => {
    if (isLoading) return <LoadingState />;
    if (error) return <ErrorState message={`${error}`} />;
    if (rankedRows.length === 0) return <EmptyState />;
    if (visibleRows.length === 0) return <NoResults query={query} />;
    return <LeaderboardFeed rows={visibleRows} />;
  };

  return (
    <PageLayout
      title="Leaderboard"
      rightSlot={<ShareProfileQrButton displayName={displayName} handle={handle} />}
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

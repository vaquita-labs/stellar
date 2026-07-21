'use client';

import { LeaderboardUserHeader, WorldMap } from '@/core-ui/components';
import { useWalletByUsername } from '@/core-ui/hooks';
import { WorldType } from '@/core-ui/types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowLeft, FiLoader } from 'react-icons/fi';

export default function UsernamePage() {
  const { t } = useTranslation();
  const params = useParams();
  // useParams keeps the raw (percent-encoded) segment; decode so legacy
  // nicknames with non-URL-safe chars still resolve. Valid usernames
  // ([a-z0-9_]) decode to themselves.
  const rawParam = params.username as string;
  const username = React.useMemo(() => {
    try {
      return decodeURIComponent(rawParam ?? '');
    } catch {
      return rawParam ?? '';
    }
  }, [rawParam]);

  // The URL carries the username, but every profile/world query is keyed by
  // wallet — resolve once and reuse the existing per-wallet components.
  // Old /explore/<G...> links pass through unchanged.
  const { walletAddress, isLoading, notFound } = useWalletByUsername(username);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <FiLoader className="h-6 w-6 animate-spin text-gray-400" aria-hidden />
      </div>
    );
  }

  if (notFound || !walletAddress) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-base font-extrabold text-black">
          {t('leaderboard.user.notFound', "We couldn't find @{{username}}", { username })}
        </p>
        <p className="text-sm text-black/60">
          {t('leaderboard.user.notFoundHint', 'The account may have changed its username or no longer exists.')}
        </p>
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 rounded-full bg-white border border-black border-b-2 px-4 py-2 text-sm font-bold text-black hover:bg-black/5 transition"
        >
          <FiArrowLeft className="h-4 w-4" />
          {t('explore.user.back', 'Back to explore')}
        </Link>
      </div>
    );
  }

  return (
    // overflow-hidden + min-h-0 so the map takes exactly the leftover space
    // and the whole screen (header + map) fits without scrolling.
    <div className="h-full w-full flex flex-col overflow-hidden min-h-0">
      <LeaderboardUserHeader walletAddress={walletAddress} />
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {/* TODO: should be a style associated with the lock period */}
        <WorldMap walletAddress={walletAddress} isLeaderboard={true} worldType={WorldType.FOREST} isAvailable={true} />
      </div>
    </div>
  );
}

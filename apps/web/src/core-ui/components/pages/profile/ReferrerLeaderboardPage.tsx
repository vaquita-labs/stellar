'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { FiUsers } from 'react-icons/fi';
import { useReferrerLeaderboard, type ReferrerLeaderboardRow } from '../../../hooks';
import { Avatar, getLeaderboardUsername, hasPublicProfile } from '../leaderboard/LeaderboardCard';
import { MockedSubPageLayout } from './MockedSubPageLayout';

/**
 * Who is bringing the most people in.
 *
 * Ranked on friends joined, with friends saving beside it. Joined is the rank
 * because saving partly reads a lazily refreshed balance snapshot, so ranking on
 * it would shuffle positions for reasons nobody caused.
 *
 * Counts only, on purpose: what a referrer's friends hold or have moved is
 * internal, and a public board is not the place to put other people's balances.
 */

/** One competitor: rank, face, name, friends joined, friends saving. */
function ReferrerRow({ row, pinned = false }: { row: ReferrerLeaderboardRow; pinned?: boolean }) {
  const { t } = useTranslation();
  const username = getLeaderboardUsername(row.nickname, row.walletAddress);

  const shell = `flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
    row.isCurrentUser ? 'border-2 border-primary bg-primary/20' : 'border border-black/10 bg-white'
  }`;

  const content = (
    <>
      <span
        className="w-6 shrink-0 text-center text-sm font-extrabold tabular-nums text-black/50"
        aria-label={t('leaderboard.card.positionLabel', 'Position {{position}}', { position: row.position })}
      >
        {row.position}
      </span>

      <Avatar username={username} avatarConfig={row.avatarConfig} seed={row.walletAddress} />

      <span className="flex-1 min-w-0 flex items-center gap-2">
        <span className="truncate text-sm font-extrabold text-black">{username}</span>
        {row.isCurrentUser && !pinned && (
          <span className="shrink-0 rounded-sm bg-black px-1.5 py-0.5 text-[7px] font-bold uppercase leading-tight tracking-wider text-white">
            {t('leaderboard.card.you', 'You')}
          </span>
        )}
      </span>

      {/* Joined is the rank, so it leads; saving rides underneath in the muted
          tone the rest of the app uses for a secondary number. */}
      <span className="shrink-0 text-right">
        <span className="flex items-center justify-end gap-1.5 text-sm font-extrabold tabular-nums text-black">
          <FiUsers className="h-3.5 w-3.5 text-gray-500" aria-hidden />
          {row.referrals.toLocaleString()}
        </span>
        <span className="block text-[11px] font-semibold tabular-nums text-gray-500">
          {t('referrals.board.savingCount', '{{n}} saving', { n: row.activeReferrals })}
        </span>
      </span>
    </>
  );

  // Same rule as the weekly league: with no nickname there is no page to open,
  // so the row keeps its numbers and stops being a link.
  return (
    <li>
      {hasPublicProfile(row.nickname) ? (
        <Link
          href={`/explore/${encodeURIComponent(row.nickname)}`}
          aria-label={t('leaderboard.card.viewWorld', "View {{username}}'s world", { username })}
          className={`${shell} transition hover:-translate-y-0.5`}
        >
          {content}
        </Link>
      ) : (
        <div className={shell}>{content}</div>
      )}
    </li>
  );
}

function BoardSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul aria-hidden className="flex flex-col gap-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-3 py-2.5 animate-pulse"
        >
          <span className="h-3 w-4 rounded bg-black/10" />
          <span className="h-10 w-10 rounded-full bg-black/10" />
          <span className="h-3 flex-1 rounded bg-black/10" />
          <span className="h-3 w-10 rounded bg-black/10" />
        </li>
      ))}
    </ul>
  );
}

export function ReferrerLeaderboardPage({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useReferrerLeaderboard();

  const rows = data?.rows ?? [];
  // Pinned only when the viewer is not already on the board — otherwise the
  // same person would appear twice.
  const pinnedMe = data?.me && !rows.some((row) => row.isCurrentUser) ? data.me : null;

  return (
    <MockedSubPageLayout
      title={t('referrals.board.title', 'Top inviters')}
      subtitle={t('referrals.board.subtitle', 'Ranked by friends who joined. Saving is how many of them are putting money to work.')}
      backHref="/profile/invite"
      onBack={onBack}
      showSoonBadge={false}
    >
      {isLoading ? (
        <BoardSkeleton />
      ) : isError ? (
        <div className="rounded-2xl border border-black border-b-2 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-black">{t('referrals.board.errorTitle', "We couldn't load the board")}</p>
          <p className="mt-1 text-xs text-gray-500">{t('referrals.board.errorBody', 'Check your connection and try again.')}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-black border-b-2 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-black">{t('referrals.board.emptyTitle', 'Nobody has invited anyone yet')}</p>
          <p className="mt-1 text-xs text-gray-500">
            {t('referrals.board.emptyBody', 'Share your link and be the first on the board.')}
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <ReferrerRow key={row.walletAddress} row={row} />
            ))}
          </ul>

          {pinnedMe && (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-xs font-extrabold uppercase tracking-wider text-gray-500">
                {t('referrals.board.yourPosition', 'Your position')}
              </h2>
              <ul className="flex flex-col gap-1.5">
                <ReferrerRow row={pinnedMe} pinned />
              </ul>
            </section>
          )}

          {!data?.me && (
            <p className="px-1 text-sm text-gray-600">
              {t('referrals.board.notRanked', 'Invite a friend to take your place on the board.')}
            </p>
          )}
        </>
      )}
    </MockedSubPageLayout>
  );
}

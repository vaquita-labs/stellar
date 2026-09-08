'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';
import { FiArrowDown, FiArrowUp } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { LeagueMemberDTO } from '../../../hooks/useWeeklyLeague';
import { Avatar, getLeaderboardUsername, hasPublicProfile } from './LeaderboardCard';
import { DEMOTION_SLOTS, Division, PROMOTION_SLOTS, zoneForRank } from './leagues';

/* ------------------------------------------------------------------ */
/* Zone separator                                                      */
/* ------------------------------------------------------------------ */

/** The green/red lines that cut the cohort into "moving up", "staying" and
 *  "dropping". They're the whole reason the board motivates: your position
 *  always has a visible line to chase, whichever end of it you're on. */
function ZoneDivider({ kind }: { kind: 'promotion' | 'demotion' }) {
  const { t } = useTranslation();
  const promotion = kind === 'promotion';
  const Arrow = promotion ? FiArrowUp : FiArrowDown;
  const tone = promotion ? 'text-[#3f9a00]' : 'text-error';
  const line = promotion ? 'bg-[#3f9a00]/30' : 'bg-error/30';

  return (
    <li aria-hidden={false} className="flex items-center gap-2 py-1">
      <span className={`h-0.5 flex-1 rounded-full ${line}`} />
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider ${tone}`}>
        <Arrow className="h-3.5 w-3.5" aria-hidden />
        {promotion
          ? t('leaderboard.league.promotionZone', 'Promotion zone')
          : t('leaderboard.league.demotionZone', 'Demotion zone')}
        <Arrow className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className={`h-0.5 flex-1 rounded-full ${line}`} />
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

/** A single competitor: rank, face, name, XP. Nothing else — the weekly board
 *  is about one number, so streaks/badges/coins stay on the profile. */
function LeagueRow({
  member,
  division,
  cohortSize,
  rowRef,
}: {
  member: LeagueMemberDTO;
  division: Division;
  cohortSize: number;
  rowRef?: (node: HTMLLIElement | null) => void;
}) {
  const { t } = useTranslation();
  const username = getLeaderboardUsername(member.nickname, member.walletAddress);
  const zone = zoneForRank(member.rank, cohortSize, division);

  const rankTone = zone === 'promotion' ? 'text-[#3f9a00]' : zone === 'demotion' ? 'text-error' : 'text-black/50';

  const shell = `flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
    member.isCurrentUser ? 'border-2 border-primary bg-primary/20' : 'border border-black/10 bg-white'
  }`;

  const content = (
    <>
      <span
        className={`w-6 shrink-0 text-center text-sm font-extrabold tabular-nums ${rankTone}`}
        aria-label={t('leaderboard.card.positionLabel', 'Position {{position}}', {
          position: member.rank,
        })}
      >
        {member.rank}
      </span>

      <Avatar username={username} avatarConfig={member.avatarConfig} seed={member.walletAddress} />

      <span className="flex-1 min-w-0 flex items-center gap-2">
        <span className="truncate text-sm font-extrabold text-black">{username}</span>
        {member.isCurrentUser && (
          <span className="shrink-0 rounded-sm bg-black px-1.5 py-0.5 text-[7px] font-bold uppercase leading-tight tracking-wider text-white">
            {t('leaderboard.card.you', 'You')}
          </span>
        )}
      </span>

      <span className="shrink-0 inline-flex items-center gap-1 text-sm font-extrabold tabular-nums text-black">
        <Image src="/icons/global/star.png" alt="" width={16} height={16} className="object-contain" />
        {t('leaderboard.league.xpValue', '{{xp}} XP', {
          xp: member.weeklyXp.toLocaleString(),
        })}
      </span>
    </>
  );

  // Same rule as the card: with no nickname there is no page to open, so the
  // row keeps its rank and its XP and stops being a link.
  return (
    <li ref={rowRef}>
      {hasPublicProfile(member.nickname) ? (
        <Link
          href={`/explore/${encodeURIComponent(member.nickname)}`}
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

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

/**
 * The cohort, in order, with the promotion line under the last promotable rank
 * and the demotion line above the bottom slots. Both lines only appear when
 * the division actually has that zone — a beginner never sees a red line.
 */
export function LeagueBoard({
  members,
  division,
  ownRowRef,
}: {
  members: LeagueMemberDTO[];
  division: Division;
  ownRowRef?: (node: HTMLLIElement | null) => void;
}) {
  const cohortSize = members.length;
  const demotionStart = cohortSize - DEMOTION_SLOTS + 1;

  return (
    <ul className="flex flex-col gap-1.5">
      {members.map((member) => {
        const zone = zoneForRank(member.rank, cohortSize, division);
        const nextRank = member.rank + 1;
        // Dividers sit *after* the row that closes a zone, so the line always
        // reads as "everything above this moves up / below this drops".
        const closesPromotion =
          member.rank === PROMOTION_SLOTS &&
          zoneForRank(member.rank, cohortSize, division) === 'promotion' &&
          nextRank <= cohortSize;
        const opensDemotion =
          nextRank === demotionStart && zoneForRank(demotionStart, cohortSize, division) === 'demotion' && zone !== 'demotion';

        return (
          <Fragment key={member.walletAddress || member.rank}>
            <LeagueRow
              member={member}
              division={division}
              cohortSize={cohortSize}
              rowRef={member.isCurrentUser ? ownRowRef : undefined}
            />
            {closesPromotion && <ZoneDivider kind="promotion" />}
            {opensDemotion && <ZoneDivider kind="demotion" />}
          </Fragment>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

export function LeagueBoardSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul aria-hidden className="flex flex-col gap-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-3 py-2.5 animate-pulse">
          <span className="h-3 w-4 rounded bg-black/10" />
          <span className="h-10 w-10 rounded-full bg-black/10" />
          <span className="h-3 flex-1 rounded bg-black/10" />
          <span className="h-3 w-12 rounded bg-black/10" />
        </li>
      ))}
    </ul>
  );
}

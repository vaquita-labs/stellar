'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWeeklyLeague } from '../../../hooks/useWeeklyLeague';
import { PageLayout } from '../../molecules';
import { getLeaderboardUsername } from './LeaderboardCard';
import { LeagueBoard, LeagueBoardSkeleton } from './LeagueBoard';
import { LeagueHeader, useDivisionName } from './LeagueHeader';
import { LeagueTrophy } from './LeagueTrophy';
import { PinnedOwnRow, useOwnRowTracking } from './PinnedOwnRow';
import { DEMOTION_SLOTS, Division, DivisionId, PROMOTION_SLOTS, divisionById } from './leagues';

/**
 * Division banner (trophy ladder + countdown) — TEMPORARILY OFF.
 *
 * The ladder is real UI over placeholder data: until the API ships cohorts and
 * a persisted division per profile (see the TODO in `useWeeklyLeague`), the
 * banner would promise promotions and demotions that never happen. The board
 * below it still works on its own, so hiding just the banner leaves an honest
 * weekly XP ranking.
 *
 * Flip this back to `true` — nothing else — once `/leaderboard/weekly` exists.
 */
const SHOW_LEAGUE_HEADER = false;

/** The countdown is coarse (days → hours → minutes), so a minute is as often as
 *  the clock can possibly change what's on screen. */
const CLOCK_TICK_MS = 60_000;

/** Re-reads the clock on an interval instead of during render, so the countdown
 *  stays live without making the render impure. */
function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

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

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-black/10 bg-white p-8 text-center">
      <Image src="/vaquita/error.svg" alt="" width={140} height={140} />
      <p className="text-base font-extrabold text-black">
        {t('leaderboard.league.empty.title', 'Nobody in this division yet')}
      </p>
      <p className="text-xs text-gray-500 max-w-xs">
        {t(
          'leaderboard.league.empty.description',
          'Save this week to earn XP — your first deposit already puts you on the board.',
        )}
      </p>
    </div>
  );
}

/** Shown when the player peeks at a division that isn't theirs. Their own board
 *  is the only one with real people in it, so previewing another one shows the
 *  trophy and what it takes to get there — never a made-up list. */
function DivisionPreview({
  division,
  locked,
  onBack,
}: {
  division: Division;
  locked: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const divisionName = useDivisionName();
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-black/10 bg-white p-8 text-center">
      <LeagueTrophy division={division} locked={locked} size={96} />
      <p className="text-base font-extrabold text-black">
        {locked
          ? t('leaderboard.league.preview.lockedTitle', 'Reach {{xp}} XP to unlock {{division}}', {
              xp: division.minXp.toLocaleString(),
              division: divisionName(division),
            })
          : t('leaderboard.league.preview.pastTitle', 'You already cleared {{division}}', {
              division: divisionName(division),
            })}
      </p>
      <p className="max-w-xs text-xs text-gray-500">
        {t(
          'leaderboard.league.preview.description',
          'You only compete against savers in your own division.',
        )}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="rounded-full border border-black border-b-2 bg-primary px-4 py-1.5 text-xs font-extrabold text-black transition hover:-translate-y-0.5"
      >
        {t('leaderboard.league.preview.back', 'Back to my division')}
      </button>
    </div>
  );
}

/** One-liner under the board explaining the rules, so the green and red lines
 *  don't have to be decoded. */
function LeagueRules({ division }: { division: Division }) {
  const { t } = useTranslation();
  return (
    <p className="px-2 text-center text-[11px] leading-relaxed text-black/50">
      {t(
        'leaderboard.league.rules',
        'The board resets every Monday. The top {{promote}} move up a division, the bottom {{demote}} drop one.',
        { promote: PROMOTION_SLOTS, demote: DEMOTION_SLOTS },
      )}{' '}
      {division.index === 0 &&
        t(
          'leaderboard.league.rulesFirstDivision',
          'In the first division nobody drops — you can only climb.',
        )}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/**
 * Weekly league board. Instead of one endless all-time ranking — where a new
 * saver is permanently #4.812 and has no reason to come back — everyone
 * competes inside a division-sized cohort that resets every Monday: the only
 * number on screen is the XP earned *this week*, and the two zone lines leave
 * every position one push away from moving.
 */
export const LeaderboardPage = () => {
  const { t } = useTranslation();
  const now = useClock();
  const { league, isLoading, error } = useWeeklyLeague();

  // Which division the header is previewing. `null` means "mine" — storing the
  // id rather than the division keeps it valid across a promotion landing
  // mid-session.
  const [previewId, setPreviewId] = useState<DivisionId | null>(null);
  const clearPreview = useCallback(() => setPreviewId(null), []);

  // Pinned "you are #N" bar — hangs from the edge your row is off past.
  const { ownRowVisible, side, resolved, ownRowRef, scrollToOwnRow, hasOwnRowNode } =
    useOwnRowTracking();
  const handlePinnedPress = useCallback(() => {
    if (hasOwnRowNode()) scrollToOwnRow();
  }, [hasOwnRowNode, scrollToOwnRow]);

  const currentDivision = league?.division ?? null;
  const previewing = !!previewId && previewId !== currentDivision?.id;
  const selectedDivision =
    previewId && currentDivision ? divisionById(previewId) : currentDivision;

  const renderBody = () => {
    if (isLoading || (!league && !error)) {
      return (
        <>
          {SHOW_LEAGUE_HEADER && (
            <div
              aria-hidden
              className="h-52 animate-pulse rounded-3xl border border-black/10 bg-white"
            />
          )}
          <LeagueBoardSkeleton />
        </>
      );
    }
    if (error) return <ErrorState message={`${error}`} />;
    if (!league || !currentDivision || !selectedDivision) return null;

    return (
      <>
        {SHOW_LEAGUE_HEADER && (
          <LeagueHeader
            current={currentDivision}
            selected={selectedDivision}
            onSelect={(division) => setPreviewId(division.id)}
            week={league.week}
            now={now}
          />
        )}
        {previewing ? (
          <DivisionPreview
            division={selectedDivision}
            locked={selectedDivision.index > currentDivision.index}
            onBack={clearPreview}
          />
        ) : league.members.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <LeagueBoard
              members={league.members}
              division={currentDivision}
              ownRowRef={ownRowRef}
            />
            <LeagueRules division={currentDivision} />
          </>
        )}
      </>
    );
  };

  return (
    <PageLayout
      title={t('leaderboard.title', 'Leaderboard')}
      backHref="/home"
      contentClassName="!gap-4"
    >
      {renderBody()}

      {/* Kept mounted while the viewer has a row, so showing/hiding is a slide
          rather than a remount. Hidden while previewing another division: the
          rank it reports doesn't belong to the board on screen. */}
      {league?.me && !previewing && (
        <PinnedOwnRow
          row={{
            position: league.me.rank,
            username: getLeaderboardUsername(league.me.nickname, league.me.walletAddress),
            avatarConfig: league.me.avatarConfig,
            walletAddress: league.me.walletAddress,
            xp: league.me.weeklyXp,
          }}
          side={side}
          shown={resolved && !ownRowVisible}
          onPress={handlePinnedPress}
        />
      )}
    </PageLayout>
  );
};

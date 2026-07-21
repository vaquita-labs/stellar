'use client';

import { useCallback, useEffect, useRef } from 'react';
import { FiClock } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { LeagueTrophy } from './LeagueTrophy';
import {
  DIVISIONS,
  Division,
  LeagueWeek,
  WeekRemaining,
  remainingInWeek,
} from './leagues';

/** Localised division name, with the English default as fallback. */
export function useDivisionName() {
  const { t } = useTranslation();
  return useCallback(
    (division: Division) =>
      t(`leaderboard.league.divisions.${division.id}`, division.defaultName),
    [t],
  );
}

/** "5 days" / "6 hours" / "12 minutes" — the same countdown Duolingo puts under
 *  the division name, coarse enough not to need a ticking timer. */
export function useRemainingLabel() {
  const { t } = useTranslation();
  return useCallback(
    (remaining: WeekRemaining) => {
      // `n`, not i18next's magic `count`: these three strings already carry
      // their own unit, so pulling in plural-key resolution would only add
      // `_one`/`_other` variants to maintain in every locale.
      if (remaining.unit === 'days')
        return t('leaderboard.league.remaining.days', '{{n}} days', { n: remaining.value });
      if (remaining.unit === 'hours')
        return t('leaderboard.league.remaining.hours', '{{n}} hours', { n: remaining.value });
      return t('leaderboard.league.remaining.minutes', '{{n}} minutes', { n: remaining.value });
    },
    [t],
  );
}

/* ------------------------------------------------------------------ */
/* Trophy carousel                                                     */
/* ------------------------------------------------------------------ */

/**
 * The full ladder, scrollable sideways. The division you're in sits in the
 * middle at full size; everything above it is locked (grey + padlock) and
 * everything below stays coloured — you can see where you came from and where
 * you're going, which is what makes a mid-table week still feel like progress.
 *
 * Tapping a badge previews that division; the page decides what to do with the
 * selection (the board itself only exists for your own division).
 */
function TrophyCarousel({
  current,
  selected,
  onSelect,
}: {
  current: Division;
  selected: Division;
  onSelect: (division: Division) => void;
}) {
  const { t } = useTranslation();
  const divisionName = useDivisionName();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef<HTMLButtonElement | null>(null);

  // Centre the player's own division on mount. Scrolling the container itself
  // (rather than scrollIntoView) keeps the page from jumping vertically.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const node = currentRef.current;
    if (!scroller || !node) return;
    scroller.scrollLeft =
      node.offsetLeft - scroller.clientWidth / 2 + node.clientWidth / 2;
  }, []);

  return (
    <div
      ref={scrollerRef}
      // `no-scrollbar` (globals.css), not a Tailwind arbitrary property: the
      // global orange scrollbar rule lives outside Tailwind's layers, so it
      // beats any utility we could put here and painted a bar under the row.
      //
      // No horizontal padding and a soft mask on both edges: the badges run off
      // the sides half-cut and fade out, which is what tells you the row
      // scrolls. `overscroll-x-contain` keeps a sideways swipe from turning into
      // a browser back-navigation on iOS.
      className="no-scrollbar flex snap-x snap-mandatory items-end gap-4 overflow-x-auto overscroll-x-contain pb-1 [mask-image:linear-gradient(to_right,transparent,black_28px,black_calc(100%-28px),transparent)]"
    >
      {DIVISIONS.map((division) => {
        const locked = division.index > current.index;
        const isCurrent = division.id === current.id;
        const isSelected = division.id === selected.id;
        return (
          <button
            key={division.id}
            ref={isCurrent ? currentRef : undefined}
            type="button"
            onClick={() => onSelect(division)}
            aria-current={isSelected ? 'true' : undefined}
            aria-label={
              locked
                ? t('leaderboard.league.divisionLocked', '{{division}} division — locked', {
                    division: divisionName(division),
                  })
                : divisionName(division)
            }
            // The ring only appears while previewing someone else's division:
            // on your own the size difference already says which one is yours,
            // and an outline there would just add noise.
            className={`shrink-0 snap-center rounded-2xl px-1 pt-1 transition ${
              isSelected ? 'opacity-100' : 'opacity-60 hover:opacity-90'
            } ${isSelected && !isCurrent ? 'bg-black/5 ring-2 ring-black/15' : ''}`}
          >
            <LeagueTrophy
              division={division}
              locked={locked}
              size={isCurrent ? 84 : 60}
            />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

/**
 * Division banner: the ladder, the name of the division being previewed and
 * how long the week has left. Washed with the division's own colour so the
 * whole screen changes character when you get promoted.
 */
export function LeagueHeader({
  current,
  selected,
  onSelect,
  week,
  now,
}: {
  current: Division;
  selected: Division;
  onSelect: (division: Division) => void;
  week: LeagueWeek;
  /** Clock value the countdown is rendered from — passed in so the header
   *  stays a pure function of props and never re-reads time mid-render. */
  now: number;
}) {
  const { t } = useTranslation();
  const divisionName = useDivisionName();
  const remainingLabel = useRemainingLabel();
  const remaining = remainingInWeek(week, now);

  return (
    <section
      className="rounded-3xl border border-black border-b-4 overflow-hidden"
      style={{ backgroundColor: selected.color.glow }}
    >
      {/* Name and countdown above the ladder and flush left, like the
          reference: the title is what you read first, and the badges below it
          are free to bleed off both edges. */}
      <div className="px-4 pt-4">
        <h2 className="text-xl font-extrabold text-black">
          {t('leaderboard.league.divisionTitle', '{{division}} Division', {
            division: divisionName(selected),
          })}
        </h2>
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-black/50">
          <FiClock aria-hidden className="h-3.5 w-3.5" />
          {remainingLabel(remaining)}
        </p>
      </div>

      <div className="pt-3 pb-4">
        <TrophyCarousel current={current} selected={selected} onSelect={onSelect} />
      </div>
    </section>
  );
}

/**
 * Weekly league model — the Duolingo-style ladder behind /leaderboard.
 *
 * The point of the ladder is that nobody is ever "last on the board": you only
 * ever compete against a cohort of your own division, and every week the board
 * resets. Ranking inside a cohort promotes the top few and demotes the bottom
 * few, so a mid-table position always has somewhere to go.
 *
 * Everything here is pure: divisions, zones and week boundaries are computed
 * from numbers/timestamps only, so the same helpers work in the UI today and in
 * the API once the backend ships real cohorts.
 */

export type DivisionId =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'sapphire'
  | 'ruby'
  | 'emerald'
  | 'amethyst'
  | 'pearl'
  | 'obsidian'
  | 'diamond';

export interface Division {
  id: DivisionId;
  /** 0-based ladder position — 0 is the entry division, last is the top one. */
  index: number;
  /** English fallback; the UI resolves `leaderboard.league.divisions.<id>`. */
  defaultName: string;
  /** Trophy art colours: `base` fills the shield, `dark` its shaded half,
   *  `light` the top facet, `glow` the header background wash. */
  color: { base: string; dark: string; light: string; glow: string };
  /** Lifetime XP needed to reach this division. */
  minXp: number;
}

export const DIVISIONS: Division[] = [
  { id: 'bronze',   index: 0, defaultName: 'Bronze',   minXp: 0,     color: { base: '#c98b4b', dark: '#a06a33', light: '#e6b380', glow: '#f6e2cc' } },
  { id: 'silver',   index: 1, defaultName: 'Silver',   minXp: 100,   color: { base: '#b6c3cc', dark: '#8d9aa4', light: '#dde5ea', glow: '#eef2f5' } },
  { id: 'gold',     index: 2, defaultName: 'Gold',     minXp: 300,   color: { base: '#f2b830', dark: '#c48d13', light: '#ffd970', glow: '#fdefc9' } },
  { id: 'sapphire', index: 3, defaultName: 'Sapphire', minXp: 700,   color: { base: '#3fa9f5', dark: '#1f77b8', light: '#8fd2ff', glow: '#d9eeff' } },
  { id: 'ruby',     index: 4, defaultName: 'Ruby',     minXp: 1500,  color: { base: '#ef4a5a', dark: '#bd2b3c', light: '#ff8b96', glow: '#ffdfe2' } },
  { id: 'emerald',  index: 5, defaultName: 'Emerald',  minXp: 3000,  color: { base: '#58cc02', dark: '#3f9a00', light: '#9cec5b', glow: '#e2f8d2' } },
  { id: 'amethyst', index: 6, defaultName: 'Amethyst', minXp: 6000,  color: { base: '#a25bf0', dark: '#7a37c4', light: '#cfa2ff', glow: '#eee0ff' } },
  { id: 'pearl',    index: 7, defaultName: 'Pearl',    minXp: 12000, color: { base: '#f0a6c8', dark: '#c9769f', light: '#ffd4e6', glow: '#fdeaf3' } },
  { id: 'obsidian', index: 8, defaultName: 'Obsidian', minXp: 25000, color: { base: '#4b5563', dark: '#2b323c', light: '#8b95a3', glow: '#e2e5ea' } },
  { id: 'diamond',  index: 9, defaultName: 'Diamond',  minXp: 50000, color: { base: '#38e0d4', dark: '#12a89e', light: '#93f4ec', glow: '#d8f8f6' } },
];

/** How many of a cohort move up, and how many drop, at the end of the week. */
export const PROMOTION_SLOTS = 7;
export const DEMOTION_SLOTS = 5;
/** Cohort size the backend will bucket people into (Duolingo uses 30). */
export const COHORT_SIZE = 30;

export const TOP_DIVISION = DIVISIONS[DIVISIONS.length - 1];
export const FIRST_DIVISION = DIVISIONS[0];

export const divisionById = (id: DivisionId): Division =>
  DIVISIONS.find((d) => d.id === id) ?? FIRST_DIVISION;

/** Ladder placement from lifetime XP. Used until the API tracks a real division
 *  per profile — it's monotonic, so nobody ever appears to fall a tier by
 *  simply reloading the page. */
export const divisionForXp = (xp: number): Division => {
  let current = FIRST_DIVISION;
  for (const division of DIVISIONS) {
    if (xp >= division.minXp) current = division;
  }
  return current;
};

export type LeagueZone = 'promotion' | 'demotion' | 'safe';

/**
 * Which zone a 1-based rank falls in. The top division has nowhere to promote
 * to and the first one nowhere to drop to, so those zones simply don't exist
 * there — the whole point is that a beginner can never be "in the red".
 */
export const zoneForRank = (
  rank: number,
  cohortSize: number,
  division: Division,
): LeagueZone => {
  const canPromote = division.index < TOP_DIVISION.index;
  const canDemote = division.index > FIRST_DIVISION.index;
  if (canPromote && rank <= PROMOTION_SLOTS) return 'promotion';
  // Only mark a demotion zone once the cohort is actually bigger than the two
  // zones combined; in a half-empty cohort everyone would otherwise be red.
  if (canDemote && cohortSize > PROMOTION_SLOTS + DEMOTION_SLOTS && rank > cohortSize - DEMOTION_SLOTS)
    return 'demotion';
  return 'safe';
};

/* ------------------------------------------------------------------ */
/* Week boundaries                                                     */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface LeagueWeek {
  /** Monday 00:00 UTC that opened the week. */
  start: number;
  /** Next Monday 00:00 UTC — exclusive end of the week. */
  end: number;
  /** Stable id (`YYYY-Www`), handy as a query key and, later, a DB key. */
  id: string;
}

/** The league week containing `now`. Weeks run Monday 00:00 UTC → Monday
 *  00:00 UTC so every player everywhere resets at the same instant. */
export const leagueWeekAt = (now: number): LeagueWeek => {
  const date = new Date(now);
  const utcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  // getUTCDay: 0 = Sunday. Shift so Monday is 0.
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const start = utcMidnight - daysSinceMonday * DAY_MS;
  const end = start + WEEK_MS;

  // ISO-week id: the Thursday of this week decides the year the week belongs to.
  const thursday = new Date(start + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - yearStart) / WEEK_MS) + 1;

  return { start, end, id: `${year}-W${String(week).padStart(2, '0')}` };
};

export type WeekRemaining =
  | { unit: 'days'; value: number }
  | { unit: 'hours'; value: number }
  | { unit: 'minutes'; value: number };

/** Coarse countdown to the reset: days while there are days left, then hours,
 *  then minutes. A ticking second counter on a 7-day window is just noise. */
export const remainingInWeek = (week: LeagueWeek, now: number): WeekRemaining => {
  const ms = Math.max(0, week.end - now);
  if (ms >= DAY_MS) return { unit: 'days', value: Math.ceil(ms / DAY_MS) };
  if (ms >= 60 * 60 * 1000) return { unit: 'hours', value: Math.ceil(ms / (60 * 60 * 1000)) };
  return { unit: 'minutes', value: Math.max(1, Math.ceil(ms / 60000)) };
};

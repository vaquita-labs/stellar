import type { AchievementResponseDTO } from '../types';
import type { AchievementDetail } from '../components/pages/profile/AchievementModal';

/**
 * Shared catalog of achievements rendered on the profile page and the trophy
 * room.
 *
 * The badge METADATA (title / description / icon / accent / tier) and the set +
 * order of badges now come from the backend catalog (`GET
 * /api/v1/badges`, editable in the admin panel) — pass it via
 * `ctx.catalog`. {@link FALLBACK_BADGE_META} is used when the catalog hasn't
 * loaded, so the grid never renders empty.
 *
 * Per-user PROGRESS + unlock for the built-in milestone keys is still computed
 * client-side from live signals (streak, deposits, XP, savings, rank) — see
 * {@link computeKnownState}. Badges that come from the backend but aren't in
 * that known set (admin-created rule badges, redeem-code badges) take their
 * `unlocked` state straight from the server response.
 *
 * Files referenced by `icon` live at `apps/web/public/icons/achievements/`.
 */
export type Badge = AchievementDetail & { unlocked: boolean };

/** Identity-level metadata for a badge (no user-specific signals). Mirrors the
 *  catalog endpoint's response, mapped to the field names the UI uses. */
export type CatalogBadgeMeta = {
  id: string;
  title: string;
  description: string;
  icon: string;
  accent?: string;
  tier?: Badge['tier'];
};

export type AchievementsCtx = {
  totalStreak: number;
  totalDeposits: number;
  experience: number;
  /** Cumulative USDC the user has ever deposited. Use the active total as a
   *  proxy until the backend exposes historical deposits. */
  totalSavedAmount?: number;
  /** Number of friends followed. `undefined` while social is not shipped. */
  friendsCount?: number;
  /** 1-based leaderboard rank; `undefined` means "not on the board". */
  leaderboardRank?: number;
  /** Server-derived: true when the user's profile was created before the
   *  Beta Tester cutoff (see `BETA_TESTER_CUTOFF` in @vaquita/shared). */
  isBetaTester?: boolean;
  /** Server-derived ISO timestamp of the Beta Tester claim, if any. */
  betaTesterClaimedAt?: string;
  /** Backend catalog metadata (from `useCatalogAchievements`). Drives which
   *  badges exist, their copy/icon/accent/tier, and their order. Falls back to
   *  {@link FALLBACK_BADGE_META} when empty/not loaded. */
  catalog?: CatalogBadgeMeta[];
  /** Full server response. Provides server-computed `unlocked` + `claimedAt`
   *  per key, and any badge whose `key` is NOT in the catalog (e.g. redeem-code
   *  badges) is appended at the end of the grid using its server copy. */
  extraAchievements?: AchievementResponseDTO[];
};

/** Default accent gradient by tier — used for server-only achievements that
 *  don't have a hand-tuned gradient in the local catalog. */
const ACCENT_BY_TIER: Record<string, string> = {
  Bronze: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
  Silver: 'linear-gradient(180deg, #E0E0E0 0%, #9E9E9E 100%)',
  Gold: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)',
  Diamond: 'linear-gradient(180deg, #FFD180 0%, #FF6F00 100%)',
  Founder: 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
};

const DEFAULT_ACCENT = ACCENT_BY_TIER.Founder;

const ICONS = '/icons/achievements';

/**
 * Static metadata fallback for the built-in 16 badges, in display order. Used
 * when the backend catalog hasn't loaded. Mirrors the rows backfilled by
 * `apps/supabase/migrations/20260529_achievement_rules.sql`.
 */
export const FALLBACK_BADGE_META: CatalogBadgeMeta[] = [
  { id: 'beta-tester', title: 'Beta Tester', description: 'You joined Vaquita during the beta. Thanks for helping us shape it.', icon: `${ICONS}/beta-tester2.png`, accent: 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)', tier: 'Founder' },
  { id: 'rookie', title: 'Rookie', description: 'Earn your first 50 XP. Welcome to the herd.', icon: `${ICONS}/rookie.png`, accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)', tier: 'Bronze' },
  { id: 'week-warrior', title: 'Week Warrior', description: 'Reach a 7-day savings streak.', icon: `${ICONS}/week-warrior.png`, accent: 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)', tier: 'Bronze' },
  { id: 'first-deposit', title: 'First Deposit', description: 'Made your very first deposit in Vaquita.', icon: `${ICONS}/first-deposit.png`, accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)', tier: 'Bronze' },
  { id: 'first-friend', title: 'Crew Mate', description: 'Follow your first fellow vaquero.', icon: `${ICONS}/first-friend.png`, accent: 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)', tier: 'Bronze' },
  { id: 'savings-starter', title: 'Savings Starter', description: 'Reach $100 USDC in cumulative deposits.', icon: `${ICONS}/savings-starter.png`, accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)', tier: 'Silver' },
  { id: 'trio-saver', title: 'Triple Threat', description: 'Keep 3 active deposits running at the same time.', icon: `${ICONS}/trio-saver.png`, accent: 'linear-gradient(180deg, #B89AFF 0%, #7C4DFF 100%)', tier: 'Silver' },
  { id: 'month-master', title: 'Month Master', description: 'Reach a 30-day savings streak.', icon: `${ICONS}/month-master.png`, accent: 'linear-gradient(180deg, #FF8A65 0%, #E64A19 100%)', tier: 'Silver' },
  { id: 'explorer', title: 'Explorer', description: 'Earn 300 XP across all challenges.', icon: `${ICONS}/explorer.png`, accent: 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)', tier: 'Silver' },
  { id: 'streak-master', title: 'Streak Master', description: 'Reach a 50-day savings streak.', icon: `${ICONS}/streak-master.png`, accent: 'linear-gradient(180deg, #FFB347 0%, #FF7A00 100%)', tier: 'Gold' },
  { id: 'whale', title: 'Vaquita Whale', description: 'Reach 30,000 XP. Now THAT is dedication.', icon: `${ICONS}/whale.png`, accent: 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)', tier: 'Gold' },
  { id: 'savings-baron', title: 'Savings Baron', description: 'Reach $10,000 USDC in cumulative deposits.', icon: `${ICONS}/savings-baron.png`, accent: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)', tier: 'Gold' },
  { id: 'century-saver', title: 'Century Saver', description: 'Reach a 100-day savings streak. Legendary.', icon: `${ICONS}/century-saver.png`, accent: 'linear-gradient(180deg, #FFD180 0%, #FF6F00 100%)', tier: 'Diamond' },
  { id: 'third-place', title: 'Bronze Medalist', description: 'Finish in the top 10 on the monthly leaderboard.', icon: `${ICONS}/third-place.png`, accent: 'linear-gradient(180deg, #FFCC80 0%, #A05A2C 100%)', tier: 'Bronze' },
  { id: 'second-place', title: 'Silver Medalist', description: 'Finish #2 on the monthly leaderboard.', icon: `${ICONS}/second-place.png`, accent: 'linear-gradient(180deg, #E0E0E0 0%, #9E9E9E 100%)', tier: 'Silver' },
  { id: 'first-place', title: 'Gold Medalist', description: 'Finish #1 on the monthly leaderboard.', icon: `${ICONS}/first-place.png`, accent: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)', tier: 'Gold' },
];

type KnownState = { progress?: { current: number; target: number }; unlocked: boolean };

/**
 * Per-user progress + unlock for the built-in milestone keys, computed from the
 * live signals. Keyed by badge id. Badges not in this map (admin-created) get
 * their unlock state from the server response instead.
 */
const computeKnownState = (ctx: AchievementsCtx): Record<string, KnownState> => {
  const isBetaTester = ctx.isBetaTester ?? false;
  const savings = ctx.totalSavedAmount ?? 0;
  const friends = ctx.friendsCount ?? 0;
  const rank = ctx.leaderboardRank;
  const exp = ctx.experience;
  const streak = ctx.totalStreak;
  const deposits = ctx.totalDeposits;

  return {
    'beta-tester': { unlocked: isBetaTester },
    rookie: { progress: { current: Math.min(exp, 50), target: 50 }, unlocked: exp >= 50 },
    'week-warrior': { progress: { current: Math.min(streak, 7), target: 7 }, unlocked: streak >= 7 },
    'first-deposit': { unlocked: deposits >= 1 },
    'first-friend': { progress: { current: Math.min(friends, 1), target: 1 }, unlocked: friends >= 1 },
    'savings-starter': { progress: { current: Math.min(Math.floor(savings), 100), target: 100 }, unlocked: savings >= 100 },
    'trio-saver': { progress: { current: Math.min(deposits, 3), target: 3 }, unlocked: deposits >= 3 },
    'month-master': { progress: { current: Math.min(streak, 30), target: 30 }, unlocked: streak >= 30 },
    explorer: { progress: { current: Math.min(exp, 300), target: 300 }, unlocked: exp >= 300 },
    'streak-master': { progress: { current: Math.min(streak, 50), target: 50 }, unlocked: streak >= 50 },
    whale: { progress: { current: Math.min(exp, 30000), target: 30000 }, unlocked: exp >= 30000 },
    'savings-baron': { progress: { current: Math.min(Math.floor(savings), 10000), target: 10000 }, unlocked: savings >= 10000 },
    'century-saver': { progress: { current: Math.min(streak, 100), target: 100 }, unlocked: streak >= 100 },
    'third-place': { unlocked: rank != null && rank >= 3 && rank <= 10 },
    'second-place': { unlocked: rank === 2 },
    'first-place': { unlocked: rank === 1 },
  };
};

export const buildAchievements = (ctx: AchievementsCtx): Badge[] => {
  const known = computeKnownState(ctx);
  const serverByKey = new Map<string, AchievementResponseDTO>(
    (ctx.extraAchievements ?? []).map((a) => [a.key, a]),
  );
  const meta = ctx.catalog && ctx.catalog.length > 0 ? ctx.catalog : [];

  const badges: Badge[] = meta.map((m) => {
    const k = known[m.id];
    const server = serverByKey.get(m.id);
    const base = {
      id: m.id,
      title: m.title,
      description: m.description,
      icon: m.icon,
      accent: m.accent,
      tier: m.tier,
    };

    if (k) {
      // Built-in milestone — preserve the client-computed progress/unlock.
      return {
        ...base,
        progress: k.progress,
        unlocked: k.unlocked,
        date: server?.claimedAt ?? (k.unlocked ? new Date().toISOString() : undefined),
      };
    }

    // Admin-created / non-milestone badge — trust the server's unlock state.
    return {
      ...base,
      unlocked: server?.unlocked ?? false,
      date: server?.claimedAt ?? undefined,
    };
  });

  // Append server achievements that aren't in the catalog at all (typically
  // hidden redeem-code badges, which only appear once claimed). The icon
  // convention is `/icons/achievements/<key>.png`.
  const catalogKeys = new Set(meta.map((m) => m.id));
  const extras: Badge[] = (ctx.extraAchievements ?? [])
    .filter((a) => !catalogKeys.has(a.key))
    .map((a) => ({
      id: a.key,
      title: a.name,
      description: a.description,
      icon: `${ICONS}/${a.key}.png`,
      accent: ACCENT_BY_TIER[a.tier] ?? DEFAULT_ACCENT,
      tier: a.tier as Badge['tier'],
      date: a.claimedAt ?? undefined,
      unlocked: a.unlocked,
    }));

  return [...badges, ...extras];
};

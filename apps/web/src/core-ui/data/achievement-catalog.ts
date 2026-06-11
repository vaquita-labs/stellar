import { clientEnv } from '@/core-ui/config/clientEnv';

/**
 * Identity-level catalog of achievements (title / description / icon / accent).
 *
 * The catalog is now served by the backend (`GET /api/v1/badges`,
 * editable from the admin panel). `getCatalogAchievement` fetches it (cached)
 * and falls back to {@link FALLBACK_CATALOG} below when the request fails — so
 * the share/OG flow keeps working even if the API is briefly unreachable.
 *
 * Decoupled from `profile-badges.ts` on purpose: the share/OG flow needs the
 * static metadata of an achievement without the user-specific signals (XP,
 * streak, unlocked state, …). The OG route and the public share page resolve a
 * badge by `id` without dragging a fake `AchievementsCtx` through them.
 */
/**
 * Cache-buster for the OG/share card image URLs. The `/og/achievement/[id]`
 * response is cached as immutable (browser + CDN) keyed by the full URL, so
 * visual changes to the card would never reach users on a stable URL. The
 * value is stamped per build in next.config.ts (commit SHA or build
 * timestamp), so every deploy rolls it automatically — no manual bumping.
 */
export const ACHIEVEMENT_CARD_VERSION = process.env.NEXT_PUBLIC_CARD_VERSION ?? 'dev';

export type CatalogAchievement = {
  id: string;
  title: string;
  description: string;
  /** Relative public path under `apps/web/public` (e.g. `/icons/...`) OR an
   *  absolute URL (admin-uploaded icon). The OG endpoint resolves relative
   *  paths against the request origin; absolute URLs pass through unchanged. */
  icon: string;
  /** CSS gradient used as the halo behind the icon. Falls back to the
   *  golden gradient when omitted. */
  accent?: string;
  tier?: 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Founder';
};

/**
 * Static fallback used only when the backend catalog endpoint is unreachable.
 * Mirrors the rows seeded in `apps/supabase/migrations/20260516_*` +
 * `20260529_achievement_rules.sql`. Keep in sync as a safety net; the backend
 * is the source of truth.
 */
export const FALLBACK_CATALOG: Record<string, CatalogAchievement> = {
  'beta-tester': {
    id: 'beta-tester',
    title: 'Beta Tester',
    description: 'You joined Vaquita during the beta. Thanks for helping us shape it.',
    icon: '/icons/achievements/beta-tester2.png',
    accent: 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
    tier: 'Founder',
  },
  rookie: {
    id: 'rookie',
    title: 'Rookie',
    description: 'Earn your first 50 XP. Welcome to the herd.',
    icon: '/icons/achievements/rookie.png',
    accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
    tier: 'Bronze',
  },
  'week-warrior': {
    id: 'week-warrior',
    title: 'Week Warrior',
    description: 'Reach a 7-day savings streak.',
    icon: '/icons/achievements/week-warrior.png',
    accent: 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)',
    tier: 'Bronze',
  },
  'first-deposit': {
    id: 'first-deposit',
    title: 'First Deposit',
    description: 'Made your very first deposit in Vaquita.',
    icon: '/icons/achievements/first-deposit.png',
    accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
    tier: 'Bronze',
  },
  'first-friend': {
    id: 'first-friend',
    title: 'Crew Mate',
    description: 'Follow your first fellow vaquero.',
    icon: '/icons/achievements/first-friend.png',
    accent: 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)',
    tier: 'Bronze',
  },
  'savings-starter': {
    id: 'savings-starter',
    title: 'Savings Starter',
    description: 'Reach $100 USDC in cumulative deposits.',
    icon: '/icons/achievements/savings-starter.png',
    accent: 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)',
    tier: 'Silver',
  },
  'trio-saver': {
    id: 'trio-saver',
    title: 'Triple Threat',
    description: 'Keep 3 active deposits running at the same time.',
    icon: '/icons/achievements/trio-saver.png',
    accent: 'linear-gradient(180deg, #B89AFF 0%, #7C4DFF 100%)',
    tier: 'Silver',
  },
  'month-master': {
    id: 'month-master',
    title: 'Month Master',
    description: 'Reach a 30-day savings streak.',
    icon: '/icons/achievements/month-master.png',
    accent: 'linear-gradient(180deg, #FF8A65 0%, #E64A19 100%)',
    tier: 'Silver',
  },
  explorer: {
    id: 'explorer',
    title: 'Explorer',
    description: 'Earn 300 XP across all challenges.',
    icon: '/icons/achievements/explorer.png',
    accent: 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)',
    tier: 'Silver',
  },
  'streak-master': {
    id: 'streak-master',
    title: 'Streak Master',
    description: 'Reach a 50-day savings streak.',
    icon: '/icons/achievements/streak-master.png',
    accent: 'linear-gradient(180deg, #FFB347 0%, #FF7A00 100%)',
    tier: 'Gold',
  },
  whale: {
    id: 'whale',
    title: 'Vaquita Whale',
    description: 'Reach 30,000 XP. Now THAT is dedication.',
    icon: '/icons/achievements/whale.png',
    accent: 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)',
    tier: 'Gold',
  },
  'savings-baron': {
    id: 'savings-baron',
    title: 'Savings Baron',
    description: 'Reach $10,000 USDC in cumulative deposits.',
    icon: '/icons/achievements/savings-baron.png',
    accent: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)',
    tier: 'Gold',
  },
  'century-saver': {
    id: 'century-saver',
    title: 'Century Saver',
    description: 'Reach a 100-day savings streak. Legendary.',
    icon: '/icons/achievements/century-saver.png',
    accent: 'linear-gradient(180deg, #FFD180 0%, #FF6F00 100%)',
    tier: 'Diamond',
  },
  'third-place': {
    id: 'third-place',
    title: 'Bronze Medalist',
    description: 'Finish #3 on the monthly leaderboard.',
    icon: '/icons/achievements/third-place.png',
    accent: 'linear-gradient(180deg, #FFCC80 0%, #A05A2C 100%)',
    tier: 'Bronze',
  },
  'second-place': {
    id: 'second-place',
    title: 'Silver Medalist',
    description: 'Finish #2 on the monthly leaderboard.',
    icon: '/icons/achievements/second-place.png',
    accent: 'linear-gradient(180deg, #E0E0E0 0%, #9E9E9E 100%)',
    tier: 'Silver',
  },
  'first-place': {
    id: 'first-place',
    title: 'Gold Medalist',
    description: 'Finish #1 on the monthly leaderboard.',
    icon: '/icons/achievements/first-place.png',
    accent: 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)',
    tier: 'Gold',
  },
};

/** @deprecated Prefer {@link getCatalogAchievement}. Kept as the static map for
 *  callers that need a synchronous lookup; reflects the fallback, not live edits. */
export const ACHIEVEMENT_CATALOG = FALLBACK_CATALOG;

type CatalogApiAchievement = {
  key: string;
  name: string;
  description: string;
  tier?: string;
  icon?: string | null;
  accent?: string | null;
};

const VALID_TIERS: ReadonlySet<string> = new Set([
  'Bronze',
  'Silver',
  'Gold',
  'Diamond',
  'Founder',
]);

const toCatalogAchievement = (a: CatalogApiAchievement): CatalogAchievement => {
  const fallback = FALLBACK_CATALOG[a.key];
  const tier = a.tier && VALID_TIERS.has(a.tier) ? (a.tier as CatalogAchievement['tier']) : fallback?.tier;
  return {
    id: a.key,
    title: a.name,
    description: a.description,
    // Convention for new/server-only badges: `/icons/achievements/<key>.png`.
    icon: a.icon ?? fallback?.icon ?? `/icons/achievements/${a.key}.png`,
    accent: a.accent ?? fallback?.accent,
    tier,
  };
};

/**
 * Fetch the catalog from the backend (cached at the framework layer for 5 min).
 * Returns the static fallback on any failure so share/OG never hard-fail.
 */
export const fetchCatalog = async (): Promise<Record<string, CatalogAchievement>> => {
  try {
    const res = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/badges`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return FALLBACK_CATALOG;
    const json = (await res.json()) as { data?: { achievements?: CatalogApiAchievement[] } };
    const list = json?.data?.achievements;
    if (!Array.isArray(list) || list.length === 0) return FALLBACK_CATALOG;
    const map: Record<string, CatalogAchievement> = {};
    for (const a of list) {
      if (!a?.key) continue;
      map[a.key] = toCatalogAchievement(a);
    }
    return map;
  } catch {
    return FALLBACK_CATALOG;
  }
};

/** Look up an achievement by id from the backend catalog (with static
 *  fallback). Returns `null` for unknown ids so callers can 404. */
export const getCatalogAchievement = async (id: string): Promise<CatalogAchievement | null> => {
  const catalog = await fetchCatalog();
  return catalog[id] ?? FALLBACK_CATALOG[id] ?? null;
};

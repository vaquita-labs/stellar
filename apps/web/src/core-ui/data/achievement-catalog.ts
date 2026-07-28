import { clientEnv } from '@/core-ui/config/clientEnv';

/**
 * Identity-level catalog of achievements (title / description / icon / accent).
 *
 * The backend is the single source of truth: the catalog is served by
 * `GET /api/v1/badges` and edited from the admin panel. There is deliberately
 * no static fallback — if the API is unreachable we surface nothing rather than
 * render badges that may no longer exist or whose copy is stale.
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
export const ACHIEVEMENT_CARD_VERSION = clientEnv.NEXT_PUBLIC_CARD_VERSION;

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

type CatalogApiAchievement = {
  key: string;
  name: string;
  description: string;
  tier?: string;
  icon?: string | null;
  accent?: string | null;
};

const VALID_TIERS: ReadonlySet<string> = new Set(['Bronze', 'Silver', 'Gold', 'Diamond', 'Founder']);

const toCatalogAchievement = (a: CatalogApiAchievement): CatalogAchievement => ({
  id: a.key,
  title: a.name,
  description: a.description,
  // Convention when the row carries no explicit icon: `/icons/achievements/<key>.png`.
  icon: a.icon ?? `/icons/achievements/${a.key}.png`,
  accent: a.accent ?? undefined,
  tier: a.tier && VALID_TIERS.has(a.tier) ? (a.tier as CatalogAchievement['tier']) : undefined,
});

/**
 * Fetch the catalog from the backend (cached at the framework layer for 5 min).
 * Returns an empty catalog on any failure — callers then resolve to `null` and
 * 404 rather than showing stale hardcoded badges.
 */
export const fetchCatalog = async (): Promise<Record<string, CatalogAchievement>> => {
  try {
    const res = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/badges`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      console.error(`Achievement catalog fetch failed: ${res.status} ${res.statusText}`);
      return {};
    }
    const json = (await res.json()) as { data?: { achievements?: CatalogApiAchievement[] } };
    const list = json?.data?.achievements;
    if (!Array.isArray(list)) {
      console.error('Achievement catalog response had no achievements array');
      return {};
    }
    const map: Record<string, CatalogAchievement> = {};
    for (const a of list) {
      if (!a?.key) continue;
      map[a.key] = toCatalogAchievement(a);
    }
    return map;
  } catch (error) {
    console.error('Achievement catalog fetch threw', error);
    return {};
  }
};

/** Look up an achievement by id from the backend catalog. Returns `null` for
 *  unknown ids (and whenever the catalog is unavailable) so callers can 404. */
export const getCatalogAchievement = async (id: string): Promise<CatalogAchievement | null> => {
  const catalog = await fetchCatalog();
  return catalog[id] ?? null;
};

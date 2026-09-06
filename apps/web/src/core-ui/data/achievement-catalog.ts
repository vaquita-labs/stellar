import { clientEnv } from '@/core-ui/config/clientEnv';

/**
 * Identity-level catalog of achievements (title / description / icon / accent).
 *
 * The backend is the single source of truth: badges are served by
 * `GET /api/v1/badges/:key` and edited from the admin panel. There is
 * deliberately no static fallback — if the API is unreachable we surface
 * nothing rather than render badges that may no longer exist or whose copy is
 * stale.
 *
 * Decoupled from `profile-badges.ts` on purpose: the share/OG flow needs the
 * static metadata of an achievement without the user-specific signals (XP,
 * streak, unlocked state, …). The OG route and the public share page resolve a
 * badge by `id` without dragging a fake `AchievementsCtx` through them.
 */
/**
 * Cache-buster for the OG/share card image URLs. The `/og/achievement/[id]`
 * response is cached as immutable (browser + CDN) keyed by the full URL, so
 * visual changes to the card would never reach users on a stable URL.
 *
 * Bumped by hand through NEXT_PUBLIC_CARD_VERSION when the card artwork
 * changes. It is not tied to the build: a value that moved every deploy would
 * invalidate every card and re-run the image render for artwork that changes a
 * couple of times a year.
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

/**
 * Shown for a badge whose row carries no `icon`. Deriving the path from the key
 * only guesses at a file: nothing ties a badge key to an asset on disk, and the
 * OG renderer has no way to recover from a miss — it would emit a card with a
 * hole where the badge goes.
 */
const PLACEHOLDER_ICON = '/icons/global/trophy.png';

const toCatalogAchievement = (a: CatalogApiAchievement): CatalogAchievement => ({
  id: a.key,
  title: a.name,
  description: a.description,
  icon: a.icon ?? PLACEHOLDER_ICON,
  accent: a.accent ?? undefined,
  tier: a.tier && VALID_TIERS.has(a.tier) ? (a.tier as CatalogAchievement['tier']) : undefined,
});

/**
 * Look up an achievement by id from the backend (cached at the framework layer
 * for 5 min). Returns `null` for unknown ids, and whenever the backend is
 * unavailable, so callers can 404 rather than render stale hardcoded badges.
 *
 * Resolves against `/badges/:key` rather than filtering the `/badges` list:
 * the list omits `hidden` redeem-code badges to keep them unenumerable, which
 * made every secret badge 404 here — no share card, no downloadable image, no
 * link unfurl. The by-key route serves them because the caller already had to
 * know the exact key to ask.
 */
export const getCatalogAchievement = async (id: string): Promise<CatalogAchievement | null> => {
  try {
    const res = await fetch(
      `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/badges/${encodeURIComponent(id)}`,
      { next: { revalidate: 300 } },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`Achievement lookup failed for "${id}": ${res.status} ${res.statusText}`);
      return null;
    }
    const json = (await res.json()) as { data?: { achievement?: CatalogApiAchievement } };
    const achievement = json?.data?.achievement;
    if (!achievement?.key) {
      console.error(`Achievement lookup for "${id}" returned no achievement`);
      return null;
    }
    return toCatalogAchievement(achievement);
  } catch (error) {
    console.error(`Achievement lookup for "${id}" threw`, error);
    return null;
  }
};

/** A verified claim: this profile really did earn this badge, on this date. */
export type BadgeClaim = {
  /** The nickname as the profile stores it, not as the URL spelled it. */
  nickname: string;
  /** ISO timestamp of the claim, straight from the row. */
  claimedAt: string;
};

/**
 * Resolve a claim of `badgeId` by `nickname`, or `null` if there is none.
 *
 * The share card names a person and a date. Both used to be query params the
 * renderer echoed straight onto the image, so anyone could produce a card
 * asserting that any profile earned any badge on any date. Callers resolve the
 * pair here instead and render only what comes back — an unresolved pair gets
 * no byline and no date, so the image cannot claim something that did not
 * happen.
 */
export const getBadgeClaim = async (badgeId: string, nickname: string): Promise<BadgeClaim | null> => {
  const handle = nickname.trim();
  if (!handle) return null;
  try {
    const res = await fetch(
      `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/badges/${encodeURIComponent(badgeId)}` +
        `/claim?nickname=${encodeURIComponent(handle)}`,
      { next: { revalidate: 300 } },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`Claim lookup failed for "${badgeId}"/"${handle}": ${res.status} ${res.statusText}`);
      return null;
    }
    const json = (await res.json()) as { data?: { claim?: BadgeClaim } };
    const claim = json?.data?.claim;
    return claim?.claimedAt ? claim : null;
  } catch (error) {
    console.error(`Claim lookup for "${badgeId}"/"${handle}" threw`, error);
    return null;
  }
};

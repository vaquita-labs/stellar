import {
  getAchievementCountsByProfile,
  getCoinsByProfile,
  getExperienceByProfile,
  getProfiles,
  getStreakCountsByProfile,
} from '../profile';
import {
  enrichLeaderboardRows,
  getLeaderboard,
  type EnrichedLeaderboardRow,
  type LeaderboardCycleStatus,
} from './index';

// Lives in its own module (not ./index) because it composes the profile
// rollups with the score computation: profile/index already imports from
// leaderboard/index, so putting these imports there would create an import
// cycle between the two services.

// ---------------------------------------------------------------------------
// Enriched leaderboard build + short-TTL cache
// ---------------------------------------------------------------------------

/**
 * How long a computed leaderboard stays fresh. The board is identical for
 * every viewer, so one computation serves every page/request in the window;
 * scores drift by (amount × 30s) at most, invisible at leaderboard scale.
 */
const ENRICHED_LEADERBOARD_TTL_MS = 30_000;

/** Junk `?cycle=<int>` values each create a cache entry — cap the map so a
 *  scan of random cycle ids can't grow memory unbounded. */
const ENRICHED_LEADERBOARD_MAX_ENTRIES = 20;

interface EnrichedLeaderboardCacheEntry {
  at: number;
  promise: Promise<EnrichedLeaderboardRow[]>;
}

const enrichedLeaderboardCache = new Map<string, EnrichedLeaderboardCacheEntry>();

/** One full leaderboard build: scores + profiles + gamification rollups. The
 *  rollup helpers log-and-degrade internally (missing rollup → zeros); only a
 *  profiles read failure aborts, since without it every row loses identity. */
async function buildEnrichedLeaderboard(
  cycleId: number,
  cycleStatus: LeaderboardCycleStatus,
): Promise<EnrichedLeaderboardRow[]> {
  const rows = await getLeaderboard(cycleId);

  const { data: profiles, error: profilesError } = await getProfiles();
  if (profilesError) {
    throw new Error('Failed to load profile metadata for leaderboard', { cause: profilesError });
  }

  const [
    { counts: badgesByProfileId },
    { counts: streaksByProfileId },
    { experience: experienceByProfileId },
    { counts: coinsByProfileId },
  ] = await Promise.all([
    getAchievementCountsByProfile(),
    getStreakCountsByProfile(),
    getExperienceByProfile(profiles),
    getCoinsByProfile(),
  ]);

  return enrichLeaderboardRows(
    rows,
    profiles,
    { badgesByProfileId, streaksByProfileId, experienceByProfileId, coinsByProfileId },
    cycleStatus,
  );
}

/**
 * Cached accessor for the enriched leaderboard of a cycle. Stores the promise
 * (not the value) so concurrent requests during a rebuild share one in-flight
 * computation instead of stampeding the DB; a failed build evicts itself so
 * the next request retries.
 */
export async function getEnrichedLeaderboard(
  cycleId: number,
  cycleStatus: LeaderboardCycleStatus,
  ttlMs: number = ENRICHED_LEADERBOARD_TTL_MS,
): Promise<EnrichedLeaderboardRow[]> {
  const key = `${cycleId}:${cycleStatus}`;
  const now = Date.now();

  const hit = enrichedLeaderboardCache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.promise;

  const promise = buildEnrichedLeaderboard(cycleId, cycleStatus);
  promise.catch(() => {
    if (enrichedLeaderboardCache.get(key)?.promise === promise) {
      enrichedLeaderboardCache.delete(key);
    }
  });

  enrichedLeaderboardCache.delete(key); // re-insert as most recent for LRU order
  enrichedLeaderboardCache.set(key, { at: now, promise });
  while (enrichedLeaderboardCache.size > ENRICHED_LEADERBOARD_MAX_ENTRIES) {
    const oldest = enrichedLeaderboardCache.keys().next().value;
    if (oldest == null) break;
    enrichedLeaderboardCache.delete(oldest);
  }

  return promise;
}

/** Test hook: drop every cached leaderboard build. */
export function clearEnrichedLeaderboardCache(): void {
  enrichedLeaderboardCache.clear();
}

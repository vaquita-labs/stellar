import { prisma } from '@vaquita/db';
import {
  getAchievementCountsByProfile,
  getExperienceByProfile,
  getProfiles,
  getStreakCountsByProfile,
} from '../profile';

/**
 * Explore feed: a shuffled stream of other vaqueros to discover and follow.
 *
 * Deliberately *not* built on the leaderboard. That board comes from
 * `getLeaderboard(cycleId)`, i.e. rows with a deposit score for the cycle, so
 * anyone who hasn't deposited yet is missing from it — exactly the new players
 * a "find friends" screen exists to surface. The pool here is the profile
 * table itself.
 */

// ---------------------------------------------------------------------------
// Candidate pool + short-TTL cache
// ---------------------------------------------------------------------------

/** Same window as the enriched leaderboard: the pool is viewer-independent, so
 *  one build serves every viewer and every page inside it. */
const EXPLORE_POOL_TTL_MS = 30_000;

export const EXPLORE_DEFAULT_PAGE_SIZE = 10;
export const EXPLORE_MAX_PAGE_SIZE = 50;

/** A discoverable profile, with the same rollups the feed card renders. No
 *  position and no score: the feed has no ranking. */
export interface ExploreProfileRow {
  walletAddress: string;
  nickname: string;
  avatarUrl: string;
  badges: number;
  streak: number;
  experience: number;
}

interface ExploreCandidate extends ExploreProfileRow {
  /** Profile id, kept internal — used to exclude and to seed the shuffle. */
  id: number;
}

export interface ExplorePage {
  rows: ExploreProfileRow[];
  /** Candidates left after excluding the viewer and everyone they follow. */
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface ExplorePoolCacheEntry {
  at: number;
  promise: Promise<ExploreCandidate[]>;
}

let explorePoolCache: ExplorePoolCacheEntry | null = null;

async function buildExplorePool(): Promise<ExploreCandidate[]> {
  const { data: profiles, error } = await getProfiles();
  if (error) {
    throw new Error('Failed to load profiles for the explore feed', { cause: error });
  }

  const [{ counts: badgesByProfileId }, { counts: streaksByProfileId }, { experience: experienceByProfileId }] =
    await Promise.all([
      getAchievementCountsByProfile(),
      getStreakCountsByProfile(),
      getExperienceByProfile(profiles),
    ]);

  return profiles
    .filter((profile) => {
      // A card with no name renders as a raw `@vaqueroXXXX` handle, which reads
      // as a broken account rather than someone worth following. Onboarding
      // makes a username mandatory, so this only filters stubs.
      const hasName = !!(profile.nickname ?? '').trim() || !!(profile.full_name ?? '').trim();
      return hasName && !!profile.wallet_address;
    })
    .map((profile) => ({
      id: profile.id,
      walletAddress: profile.wallet_address ?? '',
      nickname: profile.nickname ?? '',
      avatarUrl: profile.avatar_url ?? '',
      badges: badgesByProfileId.get(profile.id) ?? 0,
      streak: streaksByProfileId.get(profile.id) ?? 0,
      experience: experienceByProfileId.get(profile.id) ?? 0,
    }));
}

/** Cached accessor for the discoverable pool. Stores the promise so concurrent
 *  requests during a rebuild share one computation; a failed build evicts
 *  itself so the next request retries. */
async function getExplorePool(ttlMs: number = EXPLORE_POOL_TTL_MS): Promise<ExploreCandidate[]> {
  const now = Date.now();
  if (explorePoolCache && now - explorePoolCache.at < ttlMs) return explorePoolCache.promise;

  const promise = buildExplorePool();
  promise.catch(() => {
    if (explorePoolCache?.promise === promise) explorePoolCache = null;
  });
  explorePoolCache = { at: now, promise };
  return promise;
}

/** Test hook: drop the cached pool. */
export function clearExplorePoolCache(): void {
  explorePoolCache = null;
}

// ---------------------------------------------------------------------------
// Seeded shuffle
// ---------------------------------------------------------------------------

/**
 * xmur3-style 32-bit string hash. Used to order candidates by `hash(seed:id)`,
 * which gives a shuffle that is random-looking but *stable for a given seed* —
 * the property `ORDER BY random()` lacks and that infinite scroll needs, or
 * page 2 would re-draw rows already shown on page 1 and skip others entirely.
 */
function hashToUnit(seed: string, id: number): number {
  let h = 2166136261 >>> 0;
  const input = `${seed}:${id}`;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  }
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export interface ExploreFeedParams {
  viewerWallet: string;
  /** Stable per browsing session. Same seed → same order across pages. */
  seed: string;
  limit?: number;
  offset?: number;
}

/**
 * One page of the explore feed for a viewer: everyone except the viewer and the
 * profiles they already follow, shuffled by `seed`.
 *
 * Exclusions are applied server-side rather than filtered in the client, so a
 * page of `limit` rows is always `limit` rows of *new* people — filtering after
 * the slice would silently return short (or empty) pages to anyone who follows
 * a lot of accounts.
 */
export const getExploreFeed = async ({
  viewerWallet,
  seed,
  limit = EXPLORE_DEFAULT_PAGE_SIZE,
  offset = 0,
}: ExploreFeedParams): Promise<ExplorePage> => {
  const take = Math.min(Math.max(limit, 1), EXPLORE_MAX_PAGE_SIZE);
  const skip = Math.max(offset, 0);

  // Mirrors getProfile/searchFriends: a first-time viewer still resolves to a
  // row, so their own card can be excluded from their feed.
  const viewer = await prisma.profile.upsert({
    where: { walletAddress: viewerWallet },
    update: {},
    create: { walletAddress: viewerWallet },
  });

  const [pool, following] = await Promise.all([
    getExplorePool(),
    prisma.follow.findMany({
      where: { followerId: viewer.id },
      select: { followeeId: true },
    }),
  ]);

  const excluded = new Set<number>([viewer.id, ...following.map((f) => f.followeeId)]);
  const candidates = pool.filter((candidate) => !excluded.has(candidate.id));

  candidates.sort((a, b) => hashToUnit(seed, a.id) - hashToUnit(seed, b.id));

  const pageRows = candidates.slice(skip, skip + take);

  return {
    rows: pageRows.map(({ id: _id, ...row }) => row),
    total: candidates.length,
    limit: take,
    offset: skip,
    hasMore: skip + pageRows.length < candidates.length,
  };
};

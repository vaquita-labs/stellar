import { Prisma, prisma } from '@vaquita/db';
import type { Profile as PrismaProfile } from '@vaquita/db';
import type { FriendDTO, FriendSuggestionDTO } from '../../types';
import { notify } from '../notifications';
import { getStreakData } from '../profile';

// Upper bound on a single search page. Streak is computed per result (deposits +
// rewards lookups), so this also caps the per-request DB fan-out.
const MAX_RESULTS = 50;

/** `@handle` from the nickname, or a shortened wallet when there's no nickname. */
const toHandle = (p: PrismaProfile): string =>
  p.nickname?.trim()
    ? `@${p.nickname.trim().replace(/\s+/g, '').toLowerCase()}`
    : `@${p.walletAddress.slice(0, 6).toLowerCase()}`;

/** Display name: full name, else nickname, else a shortened wallet. */
const toName = (p: PrismaProfile): string =>
  p.fullName?.trim() ||
  p.nickname?.trim() ||
  `${p.walletAddress.slice(0, 4)}…${p.walletAddress.slice(-4)}`;

const toFriendDTO = (
  p: PrismaProfile,
  extra: { streak: number; followers: number; isFollowing: boolean },
): FriendDTO => ({
  walletAddress: p.walletAddress,
  name: toName(p),
  handle: toHandle(p),
  nickname: p.nickname ?? '',
  fullName: p.fullName ?? '',
  avatarUrl: p.avatarUrl ?? '',
  level: 0, // No level system yet — kept 0 by design.
  streak: extra.streak,
  followers: extra.followers,
  isFollowing: extra.isFollowing,
});

/**
 * Search profiles by nickname or full name, from the viewer's perspective.
 * Excludes the viewer, marks `isFollowing`, and includes a live follower count
 * and saving streak per result. An empty query returns the newest profiles
 * (the "Popular vaqueros" default the UI shows before the user types).
 *
 * The viewer is upserted (mirrors `getProfile`) so a first-time caller still
 * resolves to a row to diff `isFollowing` against.
 */
export const searchFriends = async ({
  viewerWallet,
  query,
  limit = 20,
}: {
  viewerWallet: string;
  query: string;
  limit?: number;
}) => {
  const viewer = await prisma.profile.upsert({
    where: { walletAddress: viewerWallet },
    update: {},
    create: { walletAddress: viewerWallet },
  });

  const q = (query ?? '').trim();
  const where: Prisma.ProfileWhereInput = {
    deletedAt: null,
    id: { not: viewer.id },
    ...(q
      ? {
          OR: [
            { nickname: { contains: q, mode: 'insensitive' } },
            { fullName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const profiles = await prisma.profile.findMany({
    where,
    take: Math.min(Math.max(limit, 1), MAX_RESULTS),
    orderBy: { createdAt: 'desc' },
  });

  const ids = profiles.map((p) => p.id);

  // Which of these the viewer already follows (single query).
  const followingRows = ids.length
    ? await prisma.follow.findMany({
        where: { followerId: viewer.id, followeeId: { in: ids } },
        select: { followeeId: true },
      })
    : [];
  const followingSet = new Set(followingRows.map((r) => r.followeeId));

  // Follower counts for the whole result set (single grouped query).
  const followerCounts = ids.length
    ? await prisma.follow.groupBy({
        by: ['followeeId'],
        where: { followeeId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const followersById = new Map(followerCounts.map((r) => [r.followeeId, r._count._all]));

  // Streak is per-profile (deposits + collected rewards). Bounded by `take`, and
  // only runs on explicit searches — compute in parallel.
  const results = await Promise.all(
    profiles.map(async (p) => {
      let streak = 0;
      try {
        // getStreakData only reads `id` and `wallet_address` off the profile.
        const s = await getStreakData({ id: p.id, wallet_address: p.walletAddress } as never);
        streak = s.yesterdayStreak + (s.todayStreak ? 1 : 0);
      } catch {
        // streak stays 0 on failure — non-fatal for the list.
      }
      return toFriendDTO(p, {
        streak,
        followers: followersById.get(p.id) ?? 0,
        isFollowing: followingSet.has(p.id),
      });
    }),
  );

  return { success: true, errors: [] as unknown[], errorMessage: '', results };
};

/**
 * Make `followerWallet` follow `followeeWallet`. Idempotent: a duplicate (unique
 * violation) is treated as success. The follower is upserted; the followee must
 * already exist. Self-follows are rejected.
 */
export const followProfile = async (followerWallet: string, followeeWallet: string) => {
  if (followerWallet === followeeWallet) {
    return { success: false, errorMessage: 'You cannot follow yourself.', errors: [], following: false };
  }

  const [follower, followee] = await Promise.all([
    prisma.profile.upsert({
      where: { walletAddress: followerWallet },
      update: {},
      create: { walletAddress: followerWallet },
    }),
    prisma.profile.findFirst({ where: { walletAddress: followeeWallet, deletedAt: null } }),
  ]);

  if (!followee) {
    return { success: false, errorMessage: 'That vaquero could not be found.', errors: [], following: false };
  }

  try {
    await prisma.follow.create({ data: { followerId: follower.id, followeeId: followee.id } });
    // Tell the followee. Deduped per edge so follow/unfollow loops don't spam.
    void notify({
      walletAddress: followeeWallet,
      type: 'friend',
      messageKey: 'newFollower',
      params: { name: toName(follower) },
      link: `/leaderboard/${followerWallet}`,
      dedupeKey: `follow-${follower.id}-${followee.id}`,
    });
  } catch (error) {
    // P2002 = unique violation: already following, treat as a no-op success.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      throw error;
    }
  }

  return { success: true, errorMessage: '', errors: [], following: true };
};

/**
 * Make `followerWallet` stop following `followeeWallet`. Idempotent: removing a
 * non-existent edge is a no-op success.
 */
export const unfollowProfile = async (followerWallet: string, followeeWallet: string) => {
  const [follower, followee] = await Promise.all([
    prisma.profile.findFirst({ where: { walletAddress: followerWallet, deletedAt: null } }),
    prisma.profile.findFirst({ where: { walletAddress: followeeWallet, deletedAt: null } }),
  ]);

  if (follower && followee) {
    await prisma.follow.deleteMany({ where: { followerId: follower.id, followeeId: followee.id } });
  }

  return { success: true, errorMessage: '', errors: [], following: false };
};

/** How many profiles this profile follows — drives the FIRST_FRIEND signal. */
export const getFollowingCount = async (profileId: number): Promise<number> =>
  prisma.follow.count({ where: { followerId: profileId } });

/**
 * Wallet addresses the viewer currently follows. Lets per-row Follow buttons
 * (leaderboard, etc.) resolve their initial state without a per-row request, so
 * a follow survives a reload. The viewer is upserted so a brand-new wallet
 * resolves to `[]` instead of erroring.
 */
export const getFollowingWallets = async (viewerWallet: string): Promise<string[]> => {
  const viewer = await prisma.profile.upsert({
    where: { walletAddress: viewerWallet },
    update: {},
    create: { walletAddress: viewerWallet },
  });

  const rows = await prisma.follow.findMany({
    where: { followerId: viewer.id },
    select: { followee: { select: { walletAddress: true } } },
  });

  return rows.map((r) => r.followee.walletAddress);
};

/**
 * Hydrate a set of profiles into `FriendDTO`s from the viewer's perspective:
 * live follower counts plus `isFollowing` (does the viewer follow each one).
 * Streak is skipped (kept 0) — these lists can be long and don't show it.
 */
const hydrateFriendList = async (
  viewerId: number,
  profiles: PrismaProfile[],
  allFollowedByViewer: boolean,
): Promise<FriendDTO[]> => {
  const ids = profiles.map((p) => p.id);
  if (!ids.length) return [];

  const followerCounts = await prisma.follow.groupBy({
    by: ['followeeId'],
    where: { followeeId: { in: ids } },
    _count: { _all: true },
  });
  const followersById = new Map(followerCounts.map((r) => [r.followeeId, r._count._all]));

  // For the "following" list everyone is followed by definition; for the
  // "followers" list we resolve which ones the viewer follows back.
  let followingSet: Set<number>;
  if (allFollowedByViewer) {
    followingSet = new Set(ids);
  } else {
    const rows = await prisma.follow.findMany({
      where: { followerId: viewerId, followeeId: { in: ids } },
      select: { followeeId: true },
    });
    followingSet = new Set(rows.map((r) => r.followeeId));
  }

  return profiles.map((p) =>
    toFriendDTO(p, {
      streak: 0,
      followers: followersById.get(p.id) ?? 0,
      isFollowing: followingSet.has(p.id),
    }),
  );
};

/** Profiles the viewer follows (newest first), for the /profile "Following" list. */
export const listFollowing = async (viewerWallet: string): Promise<FriendDTO[]> => {
  const viewer = await prisma.profile.upsert({
    where: { walletAddress: viewerWallet },
    update: {},
    create: { walletAddress: viewerWallet },
  });

  const edges = await prisma.follow.findMany({
    where: { followerId: viewer.id, followee: { deletedAt: null } },
    select: { followee: true },
    orderBy: { createdAt: 'desc' },
  });

  return hydrateFriendList(viewer.id, edges.map((e) => e.followee), true);
};

/** Profiles that follow the viewer (newest first), for the /profile "Followers" list. */
export const listFollowers = async (viewerWallet: string): Promise<FriendDTO[]> => {
  const viewer = await prisma.profile.upsert({
    where: { walletAddress: viewerWallet },
    update: {},
    create: { walletAddress: viewerWallet },
  });

  const edges = await prisma.follow.findMany({
    where: { followeeId: viewer.id, follower: { deletedAt: null } },
    select: { follower: true },
    orderBy: { createdAt: 'desc' },
  });

  return hydrateFriendList(viewer.id, edges.map((e) => e.follower), false);
};

/**
 * Following + follower counts for a wallet (the numbers shown on /profile). The
 * profile is upserted so a brand-new wallet resolves to `{ following: 0,
 * followers: 0 }` instead of erroring.
 */
export const getFollowCounts = async (
  walletAddress: string,
): Promise<{ following: number; followers: number }> => {
  const profile = await prisma.profile.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress },
  });

  const [following, followers] = await Promise.all([
    prisma.follow.count({ where: { followerId: profile.id } }),
    prisma.follow.count({ where: { followeeId: profile.id } }),
  ]);

  return { following, followers };
};

/**
 * Suggestions for the viewer's "Friend suggestions" rail. Starts with
 * friends-of-friends (profiles followed by the people the viewer follows, that
 * the viewer doesn't already follow), ranked by how many mutual friends point to
 * them. If that yields fewer than `limit`, the rest are filled with random
 * profiles. The viewer, the people they already follow, and anyone already
 * picked are always excluded.
 */
export const getFriendSuggestions = async ({
  viewerWallet,
  limit = 5,
}: {
  viewerWallet: string;
  limit?: number;
}) => {
  const viewer = await prisma.profile.upsert({
    where: { walletAddress: viewerWallet },
    update: {},
    create: { walletAddress: viewerWallet },
  });

  // 1st degree: who the viewer already follows.
  const following = await prisma.follow.findMany({
    where: { followerId: viewer.id },
    select: { followeeId: true },
  });
  const firstDegreeIds = following.map((f) => f.followeeId);

  // Everyone we never want to suggest: the viewer and the people they follow.
  const excluded = new Set<number>([viewer.id, ...firstDegreeIds]);

  // Friends-of-friends: edges from the viewer's friends to people the viewer
  // doesn't already follow. Rank a candidate by how many of the viewer's friends
  // follow them, and remember one connector for the "Followed by …" label.
  const fofEdges = firstDegreeIds.length
    ? await prisma.follow.findMany({
        where: { followerId: { in: firstDegreeIds }, followeeId: { notIn: [...excluded] } },
        select: { followerId: true, followeeId: true },
      })
    : [];

  const mutualCountById = new Map<number, number>();
  const connectorById = new Map<number, number>();
  for (const e of fofEdges) {
    mutualCountById.set(e.followeeId, (mutualCountById.get(e.followeeId) ?? 0) + 1);
    if (!connectorById.has(e.followeeId)) connectorById.set(e.followeeId, e.followerId);
  }

  const chosenIds = [...mutualCountById.keys()]
    .sort((a, b) => (mutualCountById.get(b) ?? 0) - (mutualCountById.get(a) ?? 0))
    .slice(0, limit);
  chosenIds.forEach((id) => excluded.add(id));

  // Random fill if friends-of-friends didn't reach `limit`. `ORDER BY random()`
  // gives a fresh pick each call; the array param is parameterized by Prisma.
  if (chosenIds.length < limit) {
    const need = limit - chosenIds.length;
    const excludedArr = [...excluded];
    const randoms = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM profiles
      WHERE deleted_at IS NULL AND id <> ALL(${excludedArr}::int[])
      ORDER BY random()
      LIMIT ${need}
    `;
    for (const r of randoms) chosenIds.push(r.id);
  }

  if (!chosenIds.length) {
    return { success: true, errors: [] as unknown[], errorMessage: '', suggestions: [] as FriendSuggestionDTO[] };
  }

  // Hydrate the chosen profiles, the connector names, and follower counts.
  const profiles = await prisma.profile.findMany({ where: { id: { in: chosenIds } } });
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const connectorIds = [...new Set(connectorById.values())];
  const connectors = connectorIds.length
    ? await prisma.profile.findMany({ where: { id: { in: connectorIds } } })
    : [];
  const connectorNameById = new Map(connectors.map((c) => [c.id, toName(c)]));

  const followerCounts = await prisma.follow.groupBy({
    by: ['followeeId'],
    where: { followeeId: { in: chosenIds } },
    _count: { _all: true },
  });
  const followersById = new Map(followerCounts.map((r) => [r.followeeId, r._count._all]));

  const suggestions = chosenIds
    .map((id): FriendSuggestionDTO | null => {
      const p = profileById.get(id);
      if (!p) return null;
      const connectorId = connectorById.get(id);
      const followedBy = connectorId ? connectorNameById.get(connectorId) ?? '' : '';
      return {
        ...toFriendDTO(p, { streak: 0, followers: followersById.get(id) ?? 0, isFollowing: false }),
        followedBy,
      };
    })
    .filter((s): s is FriendSuggestionDTO => s !== null);

  return { success: true, errors: [] as unknown[], errorMessage: '', suggestions };
};

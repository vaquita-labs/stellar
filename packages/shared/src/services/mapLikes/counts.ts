import { prisma } from '@vaquita/db';

/**
 * Read-only side of the map-heart graph.
 *
 * Kept apart from the mutations on purpose: those `notify()` the owner, which
 * pulls in the Ably client at import time (it throws without ABLY_KEY). The
 * leaderboard and explore feeds only ever need the counts, so they import this
 * module and stay free of that dependency.
 */

/**
 * How many hearts this profile's map has collected. Only counts likers that are
 * still alive, so soft-deleting a profile doesn't leave a phantom count (same
 * rule the follow counts use).
 */
export const getMapLikeCount = async (walletAddress: string): Promise<number> => {
  const profile = await prisma.profile.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress },
  });

  return prisma.mapLike.count({ where: { ownerId: profile.id, liker: { deletedAt: null } } });
};

/**
 * Heart counts for a page of profiles, in one grouped query — the feed rollup
 * (same shape as the badges/coins/experience rollups the leaderboard uses).
 */
export const getMapLikeCountsByProfile = async (
  profileIds: number[],
): Promise<Map<number, number>> => {
  if (!profileIds.length) return new Map();

  const rows = await prisma.mapLike.groupBy({
    by: ['ownerId'],
    where: { ownerId: { in: profileIds }, liker: { deletedAt: null } },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.ownerId, row._count._all]));
};

/**
 * Wallets whose map the viewer has already liked. Lets every heart button in a
 * feed resolve its filled/empty state from one request instead of one per row,
 * so a like survives a reload.
 */
export const getLikedMapWallets = async (viewerWallet: string): Promise<string[]> => {
  const viewer = await prisma.profile.upsert({
    where: { walletAddress: viewerWallet },
    update: {},
    create: { walletAddress: viewerWallet },
  });

  const likes = await prisma.mapLike.findMany({
    where: { likerId: viewer.id, owner: { deletedAt: null } },
    select: { owner: { select: { walletAddress: true } } },
  });

  return likes.map((like) => like.owner.walletAddress);
};

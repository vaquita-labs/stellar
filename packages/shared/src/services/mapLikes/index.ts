import { Prisma, prisma } from '@vaquita/db';
import type { Profile as PrismaProfile } from '@vaquita/db';
import { notify } from '../notifications';

/**
 * Hearts on a profile's 3D world.
 *
 * Mirrors the follow graph: one directed edge per (liker, owner) pair, unique
 * so the action is idempotent, and the counts are always "distinct vaqueros"
 * rather than tap counts. Liking your own map is rejected — the number is meant
 * to be social proof, so self-likes would make it meaningless.
 */

/** Display name for the notification, same fallback chain as the follow graph. */
const toName = (p: Pick<PrismaProfile, 'nickname' | 'fullName' | 'walletAddress'>): string =>
  p.fullName?.trim() ||
  p.nickname?.trim() ||
  `${p.walletAddress.slice(0, 4)}…${p.walletAddress.slice(-4)}`;

export const likeMap = async (likerWallet: string, ownerWallet: string) => {
  if (likerWallet === ownerWallet) {
    return { success: false, errorMessage: 'You cannot like your own map.', liked: false };
  }

  // The liker is upserted (a brand-new wallet can like before it has a row);
  // the owner must already exist and be alive.
  const [liker, owner] = await Promise.all([
    prisma.profile.upsert({
      where: { walletAddress: likerWallet },
      update: {},
      create: { walletAddress: likerWallet },
    }),
    prisma.profile.findFirst({ where: { walletAddress: ownerWallet, deletedAt: null } }),
  ]);

  if (!owner) {
    return { success: false, errorMessage: 'That vaquero could not be found.', liked: false };
  }

  try {
    await prisma.mapLike.create({ data: { likerId: liker.id, ownerId: owner.id } });
    // Deduped per edge, so like/unlike loops can't spam the owner's feed.
    void notify({
      walletAddress: ownerWallet,
      type: 'friend',
      messageKey: 'mapLiked',
      params: { name: toName(liker) },
      link: `/explore/${likerWallet}`,
      dedupeKey: `map-like-${liker.id}-${owner.id}`,
    });
  } catch (error) {
    // P2002 = unique violation: already liked, so this is a no-op success.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      throw error;
    }
  }

  return { success: true, errorMessage: '', liked: true };
};

/** Remove the heart. Idempotent: deleting a non-existent edge is a no-op. */
export const unlikeMap = async (likerWallet: string, ownerWallet: string) => {
  // The owner lookup ignores `deletedAt` on purpose: an edge pointing at a
  // soft-deleted profile still has to be removable.
  const [liker, owner] = await Promise.all([
    prisma.profile.findFirst({ where: { walletAddress: likerWallet, deletedAt: null } }),
    prisma.profile.findFirst({ where: { walletAddress: ownerWallet } }),
  ]);

  if (liker && owner) {
    await prisma.mapLike.deleteMany({ where: { likerId: liker.id, ownerId: owner.id } });
  }

  return { success: true, errorMessage: '', liked: false };
};

export * from './counts';

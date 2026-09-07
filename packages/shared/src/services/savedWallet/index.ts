import { prisma } from '@vaquita/db';
import type { SavedWallet } from '@vaquita/db';
import type { SavedWalletResponseDTO } from '../../types';

/**
 * Saved payout wallets for the withdraw flow.
 *
 * SECURITY: every read and write here is scoped by `profileId`. The id alone is
 * never a sufficient key — a UUID leaked or guessed from another account must
 * not let its owner read, rename or delete someone else's payout address. All
 * queries therefore filter on (id, profileId), and updates/deletes go through
 * `updateMany`/`updateMany`-style calls that return a count instead of throwing,
 * so a miss is reported as "not found" rather than silently touching a row.
 */

/** Rows the user can still see: soft-deleted entries stay in the table but never surface. */
const activeWhere = (profileId: number) => ({ profileId, deletedAt: null });

export const toSavedWalletResponseDTO = (row: SavedWallet): SavedWalletResponseDTO => ({
  id: row.id,
  label: row.label,
  address: row.address,
  memo: row.memo,
  network: row.network,
  createdTimestamp: row.createdAt.getTime(),
  updatedTimestamp: row.updatedAt.getTime(),
});

/** Lists the profile's non-deleted saved wallets, oldest first. */
export const getSavedWallets = async (profileId: number): Promise<SavedWallet[]> =>
  prisma.savedWallet.findMany({
    where: activeWhere(profileId),
    orderBy: { createdAt: 'asc' },
  });

/**
 * Creates a saved wallet.
 *
 * Re-saving an address the user previously deleted hits the (profile, address,
 * network) unique constraint, which still covers the soft-deleted row. That is
 * resurrection, not a conflict, so we revive the existing row with the new label
 * instead of letting a P2002 bubble up as a 409 the user cannot act on.
 */
export const createSavedWallet = async ({
  profileId,
  label,
  address,
  memo,
  network,
}: {
  profileId: number;
  label: string;
  address: string;
  memo?: string | null;
  network: string;
}): Promise<SavedWallet> => {
  // Empty/blank memo is stored as NULL: "no memo" and "" mean the same thing to
  // the destination, and NULL keeps the column honest for the "requires a memo"
  // question later in the flow.
  const memoValue = memo && memo.trim().length > 0 ? memo.trim() : null;

  const softDeleted = await prisma.savedWallet.findFirst({
    where: { profileId, address, network, deletedAt: { not: null } },
  });

  if (softDeleted) {
    return prisma.savedWallet.update({
      where: { id: softDeleted.id },
      data: { label, memo: memoValue, deletedAt: null },
    });
  }

  return prisma.savedWallet.create({
    data: { profileId, label, address, memo: memoValue, network },
  });
};

/** Renames a saved wallet. Returns null when it doesn't exist or isn't the caller's. */
export const updateSavedWallet = async (
  id: string,
  profileId: number,
  { label }: { label: string },
): Promise<SavedWallet | null> => {
  const { count } = await prisma.savedWallet.updateMany({
    where: { id, ...activeWhere(profileId) },
    data: { label },
  });

  if (count === 0) return null;

  return prisma.savedWallet.findUnique({ where: { id } });
};

/** Soft-deletes a saved wallet. Returns false when it doesn't exist or isn't the caller's. */
export const deleteSavedWallet = async (id: string, profileId: number): Promise<boolean> => {
  const { count } = await prisma.savedWallet.updateMany({
    where: { id, ...activeWhere(profileId) },
    data: { deletedAt: new Date() },
  });

  return count > 0;
};

export * from './networks';

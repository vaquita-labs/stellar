import { prisma } from '@vaquita/db';
import type { SavedBankAccount } from '@vaquita/db';
import type { SavedBankAccountResponseDTO } from '../../types';

/**
 * Saved bank accounts for the fiat off-ramp — the mirror of `savedWallet` on
 * the other side of the withdraw flow.
 *
 * SECURITY: same rule as saved wallets, and it matters more here. `fields`
 * holds the user's name, tax ID and account number, so the id alone is never a
 * sufficient key: every read and write filters on (id, profileId), and the
 * profile comes from the session token — never from the URL or the body.
 */

/** Rows the user can still see: soft-deleted entries stay in the table but never surface. */
const activeWhere = (profileId: number) => ({ profileId, deletedAt: null });

/**
 * `fields` is `Json` in Prisma, so the DB can hand back anything that was ever
 * written there. Non-string values are dropped rather than coerced: the ramp
 * form only ever produces strings, and a number arriving from an older row
 * would silently become `"[object Object]"` in an input.
 */
const toFieldRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<
    string,
    string
  >;
};

export const toSavedBankAccountResponseDTO = (row: SavedBankAccount): SavedBankAccountResponseDTO => ({
  id: row.id,
  label: row.label,
  country: row.country,
  currency: row.currency,
  rail: row.rail,
  fields: toFieldRecord(row.fields),
  createdTimestamp: row.createdAt.getTime(),
  updatedTimestamp: row.updatedAt.getTime(),
});

/** Lists the profile's non-deleted saved bank accounts, oldest first. */
export const getSavedBankAccounts = async (profileId: number): Promise<SavedBankAccount[]> =>
  prisma.savedBankAccount.findMany({
    where: activeWhere(profileId),
    orderBy: { createdAt: 'asc' },
  });

/**
 * Creates a saved bank account.
 *
 * Saving over a name that already exists in the same country is an update, not
 * a conflict: the user re-typed their details and named them the same thing, so
 * what they mean is "this is that account, corrected". Soft-deleted rows with
 * that name are revived for the same reason the wallet service does it — the
 * partial unique index would otherwise block reusing a name the user deleted.
 */
export const createSavedBankAccount = async ({
  profileId,
  label,
  country,
  currency,
  rail,
  fields,
}: {
  profileId: number;
  label: string;
  country: string;
  currency: string;
  rail?: string | null;
  fields: Record<string, string>;
}): Promise<SavedBankAccount> => {
  const railValue = rail && rail.trim().length > 0 ? rail.trim() : null;

  const existing = await prisma.savedBankAccount.findFirst({
    where: { profileId, country, label },
  });

  if (existing) {
    return prisma.savedBankAccount.update({
      where: { id: existing.id },
      data: { currency, rail: railValue, fields, deletedAt: null },
    });
  }

  return prisma.savedBankAccount.create({
    data: { profileId, label, country, currency, rail: railValue, fields },
  });
};

/** Soft-deletes a saved bank account. Returns false when it doesn't exist or isn't the caller's. */
export const deleteSavedBankAccount = async (id: string, profileId: number): Promise<boolean> => {
  const { count } = await prisma.savedBankAccount.updateMany({
    where: { id, ...activeWhere(profileId) },
    data: { deletedAt: new Date() },
  });

  return count > 0;
};

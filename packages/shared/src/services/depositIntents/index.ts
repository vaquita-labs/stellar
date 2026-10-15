import { prisma } from '@vaquita/db';
import type { DepositIntent } from '@vaquita/db';
import type { DepositIntentResponseDTO } from '../../types';
import { findIntentArrival, settleArrivedIntent } from './arrival';

export * from './arrival';
export * from './depositReceivedNotice';

/**
 * "The user said they are sending money from X" — the row behind the waiting
 * card on Home for "Deposit from another app".
 *
 * A UI marker and nothing else: it never moves or credits money. That is why a
 * client-reported `arrived` is fine here when it would not be on a ledger. The
 * worst a wrong status can do is show or hide a card. The server also closes
 * it on its own when Horizon shows the USDC landing (`./arrival`), which is
 * what tells the user — in-app and by push — that the deposit arrived.
 *
 * Every read and write is keyed on (id, profileId), with the profile taken
 * from the session, so a guessed id never reaches another user's row.
 */

export const toDepositIntentResponseDTO = (row: DepositIntent): DepositIntentResponseDTO => ({
  id: row.id,
  platformId: row.platformId,
  status: row.status as DepositIntentResponseDTO['status'],
  createdTimestamp: row.createdAt.getTime(),
  expiresTimestamp: row.expiresAt.getTime(),
  arrivedTimestamp: row.arrivedAt?.getTime() ?? null,
});

/**
 * Opens (or reuses) the profile's intent for a platform.
 *
 * One waiting card at a time: an open intent for the same platform is returned
 * as it is, so re-showing the address does not reset its clock, and an open one
 * for a different platform is cancelled first. A partial unique index on
 * (profile_id) WHERE status = 'open' backs this up against two racing tabs.
 */
export const openDepositIntent = async ({
  profileId,
  walletAddress,
  platformId,
}: {
  profileId: number;
  walletAddress: string;
  platformId: string;
}): Promise<DepositIntent> =>
  prisma.$transaction(async (tx) => {
    const now = new Date();
    const open = await tx.depositIntent.findFirst({
      where: { profileId, status: 'open', expiresAt: { gt: now } },
    });
    if (open && open.platformId === platformId && open.walletAddress === walletAddress) return open;

    // Anything else still marked open is superseded: the stale-but-unexpired
    // one is cancelled, one past its deadline is recorded as expired.
    await tx.depositIntent.updateMany({
      where: { profileId, status: 'open', expiresAt: { lte: now } },
      data: { status: 'expired' },
    });
    await tx.depositIntent.updateMany({
      where: { profileId, status: 'open' },
      data: { status: 'cancelled' },
    });

    return tx.depositIntent.create({ data: { profileId, walletAddress, platformId } });
  });

/**
 * The profile's open intent, if any. Rows past `expires_at` are flipped to
 * `expired` on the way, so no card outlives its 24 hours.
 *
 * With `detect`, the chain is asked first: an intent whose USDC already landed
 * is closed as `arrived` (and the user notified) and null comes back. This is
 * what clears the card after a reload, when the client's own before/after
 * balance comparison can no longer see the deposit.
 */
export const getOpenDepositIntent = async (
  profileId: number,
  { detect = false }: { detect?: boolean } = {},
): Promise<DepositIntent | null> => {
  await prisma.depositIntent.updateMany({
    where: { profileId, status: 'open', expiresAt: { lte: new Date() } },
    data: { status: 'expired' },
  });
  const row = await prisma.depositIntent.findFirst({
    where: { profileId, status: 'open' },
    orderBy: { createdAt: 'desc' },
  });
  if (!row || !detect) return row;

  const payment = await findIntentArrival(row);
  if (!payment) return row;
  await settleArrivedIntent(row, payment);
  return null;
};

/**
 * Closes an open intent as `arrived` or `cancelled`. Returns null when there is
 * no open intent with that id for this profile — already closed, expired or
 * someone else's — which the route reports as 404.
 */
export const closeDepositIntent = async ({
  id,
  profileId,
  status,
}: {
  id: string;
  profileId: number;
  status: 'arrived' | 'cancelled';
}): Promise<DepositIntent | null> => {
  const { count } = await prisma.depositIntent.updateMany({
    where: { id, profileId, status: 'open' },
    data: { status, ...(status === 'arrived' ? { arrivedAt: new Date() } : {}) },
  });
  if (count === 0) return null;
  return prisma.depositIntent.findFirst({ where: { id, profileId } });
};

/**
 * The client saw its balance go up and reports the intent as arrived. The
 * chain is checked first so the arrival is announced (notification + push)
 * with the real amount; when Horizon has not indexed the payment yet the card
 * is still closed as the client asked, just without a notice. Null when there
 * is no open intent with that id for this profile.
 */
export const reportDepositIntentArrived = async ({
  id,
  profileId,
}: {
  id: string;
  profileId: number;
}): Promise<DepositIntent | null> => {
  const row = await prisma.depositIntent.findFirst({ where: { id, profileId, status: 'open' } });
  if (!row) return null;

  const payment = await findIntentArrival(row);
  if (payment && (await settleArrivedIntent(row, payment))) {
    return prisma.depositIntent.findFirst({ where: { id, profileId } });
  }
  return closeDepositIntent({ id, profileId, status: 'arrived' });
};

import { Prisma, prisma } from '@vaquita/db';
import { DepositStatus, type NotificationDTO, type NotificationsResponseDTO } from '../../types';
import { ably } from '../ably';
import { getNetworkName } from '../project-config';

/**
 * In-app notifications feed (bell in the home header → /notifications).
 *
 * Emission is fire-and-forget by contract: `notify` never throws, so domain
 * flows (follow, deposit confirm, achievement claim, …) can `void notify(...)`
 * without wrapping. Idempotency comes from `dedupeKey` (UNIQUE in Postgres):
 * re-emitting the same event is a silent no-op, which lets the deposit-unlock
 * sweep run lazily on every feed read.
 */

const NOTIFICATIONS_CHANNEL = 'notifications-changes';
const MAX_FEED = 100;

export type NotificationInput = {
  walletAddress: string;
  type: 'deposit' | 'reward' | 'streak' | 'friend' | 'system';
  /** i18n key suffix the frontend renders: `notificationsCenter.messages.<key>` */
  messageKey: string;
  params?: Record<string, string | number>;
  /** In-app route opened when the notification is tapped. */
  link?: string;
  /** Unique key making this emission idempotent (e.g. `follow-1-2`). */
  dedupeKey?: string;
};

/** Nudges subscribed clients to refetch the recipient's feed. */
const broadcastNotificationsChange = async (walletAddress: string) => {
  const channel = ably.channels.get(NOTIFICATIONS_CHANNEL);
  await channel.publish('change', { walletAddress, timestamp: Date.now() });
};

export const notify = async (input: NotificationInput): Promise<void> => {
  try {
    const profile = await prisma.profile.upsert({
      where: { walletAddress: input.walletAddress },
      update: {},
      create: { walletAddress: input.walletAddress },
    });

    await prisma.notification.create({
      data: {
        profileId: profile.id,
        type: input.type,
        messageKey: input.messageKey,
        params: input.params ?? {},
        link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
      },
    });

    await broadcastNotificationsChange(input.walletAddress);
  } catch (error) {
    // P2002 = dedupeKey already emitted: expected no-op. Anything else is
    // logged but swallowed — notifications must never break the domain flow.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return;
    }
    console.error('Error on notify', { input }, error);
  }
};

const fmtAmount = (amount: Prisma.Decimal | number | null | undefined): string =>
  Number(amount ?? 0).toFixed(2);

/**
 * Lazy "you can withdraw now" sweep: deposits whose lock period has elapsed and
 * that have no withdrawal yet get a deduped `depositUnlocked` notification.
 * Running it on every feed read avoids cron infrastructure; `dedupeKey` keeps
 * it idempotent.
 */
const ensureDepositUnlockedNotifications = async (walletAddress: string) => {
  const deposits = await prisma.deposit.findMany({
    where: {
      walletAddress,
      status: DepositStatus.CONFIRMED,
      deletedAt: null,
      lockPeriod: { not: null },
      withdrawals: { none: {} },
    },
    select: { id: true, amount: true, lockPeriod: true, confirmedAt: true, createdAt: true },
  });

  const now = Date.now();
  const unlocked = deposits.filter((d) => {
    const start = (d.confirmedAt ?? d.createdAt).getTime();
    return start + Number(d.lockPeriod) <= now;
  });

  for (const d of unlocked) {
    await notify({
      walletAddress,
      type: 'deposit',
      messageKey: 'depositUnlocked',
      params: { amount: fmtAmount(d.amount) },
      link: '/home',
      dedupeKey: `deposit-unlocked-${d.id}`,
    });
  }
};

const toNotificationDTO = (n: {
  id: bigint;
  type: string;
  messageKey: string;
  params: Prisma.JsonValue;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDTO => ({
  id: String(n.id),
  type: n.type as NotificationDTO['type'],
  messageKey: n.messageKey,
  params: (n.params ?? {}) as Record<string, string | number>,
  link: n.link ?? '',
  read: !!n.readAt,
  createdAt: n.createdAt.getTime(),
});

export const listNotifications = async (walletAddress: string): Promise<NotificationsResponseDTO> => {
  const profile = await prisma.profile.upsert({
    where: { walletAddress },
    update: {},
    create: { walletAddress },
  });

  try {
    await ensureDepositUnlockedNotifications(walletAddress);
  } catch (error) {
    // Non-fatal: the feed still serves what exists.
    console.error('Error on ensureDepositUnlockedNotifications', { walletAddress }, error);
  }

  const rows = await prisma.notification.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: 'desc' },
    take: MAX_FEED,
  });

  return {
    networkName: await getNetworkName(),
    walletAddress,
    notifications: rows.map(toNotificationDTO),
    unread: rows.reduce((acc, n) => acc + (n.readAt ? 0 : 1), 0),
  };
};

export const markNotificationRead = async (walletAddress: string, id: string) => {
  const notificationId = BigInt(id);
  await prisma.notification.updateMany({
    where: { id: notificationId, readAt: null, profile: { walletAddress } },
    data: { readAt: new Date() },
  });
  return { success: true as const };
};

export const markAllNotificationsRead = async (walletAddress: string) => {
  await prisma.notification.updateMany({
    where: { readAt: null, profile: { walletAddress } },
    data: { readAt: new Date() },
  });
  return { success: true as const };
};

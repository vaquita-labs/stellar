import { prisma } from '@vaquita/db';

/**
 * The private chat between a user and the team, opened from the app's Help
 * Center and answered from apps/admin. No realtime transport: both sides poll.
 *
 * SECURITY: on the user side the wallet always comes from the session token, so
 * a user can only ever read or write their own thread.
 */

export const SUPPORT_AUTHORS = ['user', 'team'] as const;
export type SupportAuthor = (typeof SUPPORT_AUTHORS)[number];

export const SUPPORT_MESSAGE_MAX = 2000;

/**
 * How many messages one wallet may send per hour. Not a security boundary — a
 * guard against a stuck send button or someone pasting a script into the box.
 * A real conversation never gets near it.
 */
export const SUPPORT_HOURLY_LIMIT = 60;

/** Newest messages returned per thread. Older ones are kept, just not sent. */
const THREAD_LIMIT = 200;

/** User messages counted for the inbox badge; the screen shows anything above as "9+". */
const PENDING_SCAN = 10;

export type SupportMessageDTO = {
  id: string;
  author: SupportAuthor;
  body: string;
  createdAt: string;
};

export type SupportConversationStatus = 'waiting' | 'answered' | 'resolved';

export type SupportConversationSummary = {
  id: string;
  walletAddress: string;
  nickname: string | null;
  status: SupportConversationStatus;
  lastMessage: SupportMessageDTO | null;
  /** User messages since the team's last reply, capped at PENDING_SCAN. */
  pendingCount: number;
  lastMessageAt: string;
};

export type SupportConversationDetail = Omit<SupportConversationSummary, 'lastMessage' | 'pendingCount'> & {
  messages: SupportMessageDTO[];
};

const toMessageDTO = (row: { id: string; author: string; body: string; createdAt: Date }): SupportMessageDTO => ({
  id: row.id,
  author: row.author as SupportAuthor,
  body: row.body,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Resolving wins over who spoke last: an admin can close a thread whose last
 * word is the user's "thanks". Any new message clears `resolvedAt`, which is
 * what puts a resolved thread back in the queue.
 */
const statusOf = (row: { resolvedAt: Date | null; lastMessageAuthor: string }): SupportConversationStatus =>
  row.resolvedAt ? 'resolved' : row.lastMessageAuthor === 'user' ? 'waiting' : 'answered';

const newestFirst = { createdAt: 'desc' } as const;

/** The user's own thread, oldest message first. Empty when they never wrote. */
export const getSupportThreadForWallet = async (walletAddress: string): Promise<SupportMessageDTO[]> => {
  const conversation = await prisma.supportConversation.findUnique({
    where: { walletAddress },
    select: {
      messages: {
        orderBy: newestFirst,
        take: THREAD_LIMIT,
        select: { id: true, author: true, body: true, createdAt: true },
      },
    },
  });
  return (conversation?.messages ?? []).reverse().map(toMessageDTO);
};

export const countRecentSupportMessages = async (walletAddress: string): Promise<number> =>
  prisma.supportMessage.count({
    where: {
      author: 'user',
      conversation: { walletAddress },
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });

/**
 * What a user message did to its thread, for the team's alert:
 * - `new`      — the first message ever from this wallet.
 * - `reopened` — the thread had been resolved.
 * - `followup` — an ongoing thread.
 */
export type SupportMessageKind = 'new' | 'reopened' | 'followup';

export type CreatedUserSupportMessage = {
  message: SupportMessageDTO;
  conversationId: string;
  kind: SupportMessageKind;
};

/**
 * Appends a user message, creating the conversation on the first one. The
 * denormalized columns move in the same transaction so the inbox never shows a
 * thread whose summary disagrees with its messages.
 */
export const createUserSupportMessage = async ({
  walletAddress,
  profileId,
  body,
}: {
  walletAddress: string;
  profileId: number | null;
  body: string;
}): Promise<CreatedUserSupportMessage> => {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    // Read only to classify the message. The upsert below still decides the
    // write, so two simultaneous first messages end in one thread, both
    // reported as `new` — harmless for an alert.
    const previous = await tx.supportConversation.findUnique({
      where: { walletAddress },
      select: { resolvedAt: true },
    });
    const conversation = await tx.supportConversation.upsert({
      where: { walletAddress },
      create: { walletAddress, profileId, lastMessageAt: now, lastMessageAuthor: 'user' },
      update: {
        lastMessageAt: now,
        lastMessageAuthor: 'user',
        resolvedAt: null,
        // Backfills a thread started before the profile existed.
        ...(profileId !== null ? { profileId } : {}),
      },
      select: { id: true },
    });
    const message = await tx.supportMessage.create({
      data: { conversationId: conversation.id, author: 'user', body, createdAt: now },
    });
    return {
      message: toMessageDTO(message),
      conversationId: conversation.id,
      kind: !previous ? 'new' : previous.resolvedAt ? 'reopened' : 'followup',
    };
  });
};

/** Appends a team reply. Null when the conversation does not exist. */
export const createTeamSupportMessage = async (
  conversationId: string,
  body: string,
): Promise<SupportMessageDTO | null> => {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.supportConversation.updateMany({
      where: { id: conversationId },
      data: { lastMessageAt: now, lastMessageAuthor: 'team', resolvedAt: null },
    });
    if (updated.count === 0) return null;
    const message = await tx.supportMessage.create({
      data: { conversationId, author: 'team', body, createdAt: now },
    });
    return toMessageDTO(message);
  });
};

/** False when the conversation does not exist. */
export const setSupportConversationResolved = async (conversationId: string, resolved: boolean): Promise<boolean> => {
  const updated = await prisma.supportConversation.updateMany({
    where: { id: conversationId },
    data: { resolvedAt: resolved ? new Date() : null },
  });
  return updated.count > 0;
};

/** The admin inbox, most recent activity first. */
export const listSupportConversations = async ({ limit = 200 }: { limit?: number } = {}): Promise<
  SupportConversationSummary[]
> => {
  const rows = await prisma.supportConversation.findMany({
    orderBy: { lastMessageAt: 'desc' },
    take: limit,
    select: {
      id: true,
      walletAddress: true,
      resolvedAt: true,
      lastMessageAt: true,
      lastMessageAuthor: true,
      profile: { select: { nickname: true } },
      messages: {
        orderBy: newestFirst,
        take: PENDING_SCAN,
        select: { id: true, author: true, body: true, createdAt: true },
      },
    },
  });

  return rows.map((row) => {
    const trailingUser = row.messages.findIndex((m) => m.author !== 'user');
    return {
      id: row.id,
      walletAddress: row.walletAddress,
      nickname: row.profile?.nickname ?? null,
      status: statusOf(row),
      lastMessage: row.messages[0] ? toMessageDTO(row.messages[0]) : null,
      pendingCount: trailingUser === -1 ? row.messages.length : trailingUser,
      lastMessageAt: row.lastMessageAt.toISOString(),
    };
  });
};

/** One thread for the admin, oldest message first. */
export const getSupportConversation = async (conversationId: string): Promise<SupportConversationDetail | null> => {
  const row = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      walletAddress: true,
      resolvedAt: true,
      lastMessageAt: true,
      lastMessageAuthor: true,
      profile: { select: { nickname: true } },
      messages: {
        orderBy: newestFirst,
        take: THREAD_LIMIT,
        select: { id: true, author: true, body: true, createdAt: true },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    walletAddress: row.walletAddress,
    nickname: row.profile?.nickname ?? null,
    status: statusOf(row),
    lastMessageAt: row.lastMessageAt.toISOString(),
    messages: row.messages.reverse().map(toMessageDTO),
  };
};

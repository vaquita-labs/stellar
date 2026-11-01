import { prisma } from '@vaquita/db';

/**
 * The private chat between a user and the team, opened from the app's Help
 * Center and answered from apps/admin. No realtime transport: both sides poll.
 *
 * One conversation per wallet (admin inbox). Topics the user opens are tickets
 * under that conversation.
 *
 * SECURITY: on the user side the wallet always comes from the session token, so
 * a user can only ever read or write their own tickets.
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

/** Newest messages returned per ticket/thread. Older ones are kept, just not sent. */
const THREAD_LIMIT = 200;

/** User messages counted for the inbox badge; the screen shows anything above as "9+". */
const PENDING_SCAN = 10;

const SUBJECT_MAX = 120;

export type SupportMessageDTO = {
  id: string;
  author: SupportAuthor;
  body: string;
  createdAt: string;
};

export type SupportConversationStatus = 'waiting' | 'answered' | 'resolved';

export type SupportTicketStatus = SupportConversationStatus;

export type SupportTicketSummary = {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  openedAt: string;
  resolvedAt: string | null;
  lastMessageAt: string;
  lastMessage: SupportMessageDTO | null;
};

export type SupportTicketDetail = SupportTicketSummary & {
  messages: SupportMessageDTO[];
};

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

/** First line of a ticket: collapse whitespace and cap at SUBJECT_MAX. */
export const subjectFromBody = (body: string): string => {
  const trimmed = body.replace(/\s+/g, ' ').trim().slice(0, SUBJECT_MAX);
  return trimmed.length > 0 ? trimmed : '…';
};

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
 * - `reopened` — the conversation or the ticket had been resolved.
 * - `followup` — an ongoing open ticket.
 */
export type SupportMessageKind = 'new' | 'reopened' | 'followup';

export type CreatedUserSupportMessage = {
  message: SupportMessageDTO;
  conversationId: string;
  ticketId: string;
  kind: SupportMessageKind;
};

type TicketRow = {
  id: string;
  resolvedAt: Date | null;
  lastMessageAt: Date;
  lastMessageAuthor: string;
  subject: string;
  openedAt: Date;
};

const ticketSelect = {
  id: true,
  subject: true,
  openedAt: true,
  resolvedAt: true,
  lastMessageAt: true,
  lastMessageAuthor: true,
} as const;

const toTicketSummary = (
  row: TicketRow & { messages?: { id: string; author: string; body: string; createdAt: Date }[] },
): SupportTicketSummary => ({
  id: row.id,
  subject: row.subject,
  status: statusOf(row),
  openedAt: row.openedAt.toISOString(),
  resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  lastMessageAt: row.lastMessageAt.toISOString(),
  lastMessage: row.messages?.[0] ? toMessageDTO(row.messages[0]) : null,
});

/** The caller's tickets, most recent activity first. */
export const listSupportTicketsForWallet = async (walletAddress: string): Promise<SupportTicketSummary[]> => {
  const rows = await prisma.supportTicket.findMany({
    where: { walletAddress },
    orderBy: { lastMessageAt: 'desc' },
    select: {
      ...ticketSelect,
      messages: {
        orderBy: newestFirst,
        take: 1,
        select: { id: true, author: true, body: true, createdAt: true },
      },
    },
  });
  return rows.map(toTicketSummary);
};

/** One ticket with its messages, oldest first. Null when missing or not theirs. */
export const getSupportTicketForWallet = async (
  walletAddress: string,
  ticketId: string,
): Promise<SupportTicketDetail | null> => {
  const row = await prisma.supportTicket.findFirst({
    where: { id: ticketId, walletAddress },
    select: {
      ...ticketSelect,
      messages: {
        orderBy: newestFirst,
        take: THREAD_LIMIT,
        select: { id: true, author: true, body: true, createdAt: true },
      },
    },
  });
  if (!row) return null;
  const messages = [...row.messages].reverse().map(toMessageDTO);
  return {
    id: row.id,
    subject: row.subject,
    status: statusOf(row),
    openedAt: row.openedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessage: messages.length > 0 ? messages[messages.length - 1]! : null,
    messages,
  };
};

/**
 * Appends a user message. With `ticketId`, the ticket must belong to the wallet
 * (otherwise null). Without it, uses the open ticket of most recent activity or
 * creates a new one. Always updates the parent conversation denormalized cols.
 */
export const createUserSupportMessage = async ({
  walletAddress,
  profileId,
  body,
  ticketId,
}: {
  walletAddress: string;
  profileId: number | null;
  body: string;
  ticketId?: string | null;
}): Promise<CreatedUserSupportMessage | null> => {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const previous = await tx.supportConversation.findUnique({
      where: { walletAddress },
      select: { id: true, resolvedAt: true },
    });

    let ownedTicket: { id: string; resolvedAt: Date | null } | null = null;
    if (ticketId) {
      ownedTicket = await tx.supportTicket.findFirst({
        where: { id: ticketId, walletAddress },
        select: { id: true, resolvedAt: true },
      });
      if (!ownedTicket) return null;
    }

    const conversation = await tx.supportConversation.upsert({
      where: { walletAddress },
      create: { walletAddress, profileId, lastMessageAt: now, lastMessageAuthor: 'user' },
      update: {
        lastMessageAt: now,
        lastMessageAuthor: 'user',
        resolvedAt: null,
        ...(profileId !== null ? { profileId } : {}),
      },
      select: { id: true },
    });

    let finalTicketId: string;
    let kind: SupportMessageKind;

    if (ownedTicket) {
      finalTicketId = ownedTicket.id;
      kind = !previous
        ? 'new'
        : ownedTicket.resolvedAt || previous.resolvedAt
          ? 'reopened'
          : 'followup';
      await tx.supportTicket.update({
        where: { id: finalTicketId },
        data: { lastMessageAt: now, lastMessageAuthor: 'user', resolvedAt: null },
      });
    } else {
      const open = await tx.supportTicket.findFirst({
        where: { conversationId: conversation.id, resolvedAt: null },
        orderBy: { lastMessageAt: 'desc' },
        select: { id: true },
      });
      if (open) {
        finalTicketId = open.id;
        kind = !previous ? 'new' : previous.resolvedAt ? 'reopened' : 'followup';
        await tx.supportTicket.update({
          where: { id: finalTicketId },
          data: { lastMessageAt: now, lastMessageAuthor: 'user', resolvedAt: null },
        });
      } else {
        const created = await tx.supportTicket.create({
          data: {
            conversationId: conversation.id,
            walletAddress,
            subject: subjectFromBody(body),
            openedAt: now,
            lastMessageAt: now,
            lastMessageAuthor: 'user',
          },
          select: { id: true },
        });
        finalTicketId = created.id;
        kind = !previous ? 'new' : previous.resolvedAt ? 'reopened' : 'followup';
      }
    }

    const message = await tx.supportMessage.create({
      data: {
        conversationId: conversation.id,
        ticketId: finalTicketId,
        author: 'user',
        body,
        createdAt: now,
      },
    });

    return {
      message: toMessageDTO(message),
      conversationId: conversation.id,
      ticketId: finalTicketId,
      kind,
    };
  });
};

/** Appends a team reply onto the open ticket (or the latest if all resolved). Null when missing. */
export const createTeamSupportMessage = async (
  conversationId: string,
  body: string,
): Promise<SupportMessageDTO | null> => {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.supportConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, walletAddress: true },
    });
    if (!conversation) return null;

    let ticket = await tx.supportTicket.findFirst({
      where: { conversationId, resolvedAt: null },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    if (!ticket) {
      ticket = await tx.supportTicket.findFirst({
        where: { conversationId },
        orderBy: { lastMessageAt: 'desc' },
        select: { id: true },
      });
    }
    // Pre-ticket row or empty conversation: create a shell ticket so the reply
    // is still attributable when the user opens the list.
    if (!ticket) {
      ticket = await tx.supportTicket.create({
        data: {
          conversationId,
          walletAddress: conversation.walletAddress,
          subject: subjectFromBody(body),
          openedAt: now,
          lastMessageAt: now,
          lastMessageAuthor: 'team',
        },
        select: { id: true },
      });
    }

    await tx.supportConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, lastMessageAuthor: 'team', resolvedAt: null },
    });
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { lastMessageAt: now, lastMessageAuthor: 'team', resolvedAt: null },
    });
    const message = await tx.supportMessage.create({
      data: {
        conversationId,
        ticketId: ticket.id,
        author: 'team',
        body,
        createdAt: now,
      },
    });
    return toMessageDTO(message);
  });
};

/**
 * Resolve closes the conversation and every open ticket. Un-resolve clears the
 * conversation and reopens the most recently active ticket.
 */
export const setSupportConversationResolved = async (conversationId: string, resolved: boolean): Promise<boolean> => {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.supportConversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conversation) return false;

    if (resolved) {
      const now = new Date();
      await tx.supportConversation.update({
        where: { id: conversationId },
        data: { resolvedAt: now },
      });
      await tx.supportTicket.updateMany({
        where: { conversationId, resolvedAt: null },
        data: { resolvedAt: now },
      });
      return true;
    }

    await tx.supportConversation.update({
      where: { id: conversationId },
      data: { resolvedAt: null },
    });
    const last = await tx.supportTicket.findFirst({
      where: { conversationId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    if (last) {
      await tx.supportTicket.update({
        where: { id: last.id },
        data: { resolvedAt: null },
      });
    }
    return true;
  });
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

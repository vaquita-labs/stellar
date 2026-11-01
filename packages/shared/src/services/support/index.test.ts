import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => {
  const tx = {
    supportConversation: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    supportTicket: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    supportMessage: {
      create: vi.fn(),
    },
  };
  return {
    ...tx,
    supportConversation: {
      ...tx.supportConversation,
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    supportTicket: {
      ...tx.supportTicket,
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    supportMessage: {
      ...tx.supportMessage,
      count: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    __tx: tx,
  };
});

vi.mock('@vaquita/db', () => ({ prisma }));

const {
  createTeamSupportMessage,
  createUserSupportMessage,
  getSupportTicketForWallet,
  listSupportTicketsForWallet,
  setSupportConversationResolved,
  subjectFromBody,
} = await import('./index');

const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const CONV = '11111111-1111-4111-8111-111111111111';
const TICKET = '22222222-2222-4222-8222-222222222222';
const MSG = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('subjectFromBody', () => {
  it('collapses whitespace and caps at 120', () => {
    expect(subjectFromBody('  hola   mundo  ')).toBe('hola mundo');
    expect(subjectFromBody('x'.repeat(200)).length).toBe(120);
    expect(subjectFromBody('   ')).toBe('…');
  });
});

describe('listSupportTicketsForWallet', () => {
  it('maps status from resolvedAt and last author', async () => {
    prisma.supportTicket.findMany.mockResolvedValue([
      {
        id: TICKET,
        subject: 'Hola',
        openedAt: new Date('2026-10-01T00:00:00.000Z'),
        resolvedAt: null,
        lastMessageAt: new Date('2026-10-02T00:00:00.000Z'),
        lastMessageAuthor: 'user',
        messages: [{ id: MSG, author: 'user', body: 'Hola', createdAt: new Date('2026-10-02T00:00:00.000Z') }],
      },
    ]);
    const tickets = await listSupportTicketsForWallet(WALLET);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ id: TICKET, status: 'waiting', subject: 'Hola' });
    expect(tickets[0]!.lastMessage?.body).toBe('Hola');
  });
});

describe('getSupportTicketForWallet', () => {
  it('returns null when the ticket is not theirs', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue(null);
    expect(await getSupportTicketForWallet(WALLET, TICKET)).toBeNull();
  });

  it('returns messages oldest first', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue({
      id: TICKET,
      subject: 'Hola',
      openedAt: new Date('2026-10-01T00:00:00.000Z'),
      resolvedAt: null,
      lastMessageAt: new Date('2026-10-02T12:00:00.000Z'),
      lastMessageAuthor: 'team',
      messages: [
        { id: 'b', author: 'team', body: 'segundo', createdAt: new Date('2026-10-02T12:00:00.000Z') },
        { id: 'a', author: 'user', body: 'primero', createdAt: new Date('2026-10-01T00:00:00.000Z') },
      ],
    });
    const ticket = await getSupportTicketForWallet(WALLET, TICKET);
    expect(ticket?.status).toBe('answered');
    expect(ticket?.messages.map((m) => m.body)).toEqual(['primero', 'segundo']);
    expect(ticket?.lastMessage?.body).toBe('segundo');
  });
});

describe('createUserSupportMessage', () => {
  const tx = prisma.__tx;

  it('returns null when ticketId is not owned', async () => {
    tx.supportConversation.findUnique.mockResolvedValue({ id: CONV, resolvedAt: null });
    tx.supportTicket.findFirst.mockResolvedValue(null);
    expect(
      await createUserSupportMessage({ walletAddress: WALLET, profileId: 1, body: 'hola', ticketId: TICKET }),
    ).toBeNull();
  });

  it('creates conversation and ticket on the first message', async () => {
    tx.supportConversation.findUnique.mockResolvedValue(null);
    tx.supportConversation.upsert.mockResolvedValue({ id: CONV });
    tx.supportTicket.findFirst.mockResolvedValue(null);
    tx.supportTicket.create.mockResolvedValue({ id: TICKET });
    tx.supportMessage.create.mockResolvedValue({
      id: MSG,
      author: 'user',
      body: 'Necesito ayuda',
      createdAt: new Date('2026-10-31T12:00:00.000Z'),
    });

    const created = await createUserSupportMessage({
      walletAddress: WALLET,
      profileId: null,
      body: 'Necesito ayuda',
    });
    expect(created).toMatchObject({
      conversationId: CONV,
      ticketId: TICKET,
      kind: 'new',
      message: { body: 'Necesito ayuda', author: 'user' },
    });
    expect(tx.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subject: 'Necesito ayuda', walletAddress: WALLET }),
      }),
    );
  });

  it('reopens a resolved ticket and marks kind reopened', async () => {
    tx.supportConversation.findUnique.mockResolvedValue({ id: CONV, resolvedAt: null });
    tx.supportTicket.findFirst.mockResolvedValue({ id: TICKET, resolvedAt: new Date('2026-10-30T00:00:00.000Z') });
    tx.supportConversation.upsert.mockResolvedValue({ id: CONV });
    tx.supportTicket.update.mockResolvedValue({});
    tx.supportMessage.create.mockResolvedValue({
      id: MSG,
      author: 'user',
      body: 'sigo esperando',
      createdAt: new Date('2026-10-31T12:00:00.000Z'),
    });

    const created = await createUserSupportMessage({
      walletAddress: WALLET,
      profileId: 1,
      body: 'sigo esperando',
      ticketId: TICKET,
    });
    expect(created?.kind).toBe('reopened');
    expect(tx.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TICKET },
        data: expect.objectContaining({ resolvedAt: null, lastMessageAuthor: 'user' }),
      }),
    );
  });

  it('opens a new ticket when every ticket is resolved and no ticketId is sent', async () => {
    tx.supportConversation.findUnique.mockResolvedValue({ id: CONV, resolvedAt: new Date() });
    tx.supportConversation.upsert.mockResolvedValue({ id: CONV });
    // first findFirst is ownership (skipped); second is open-ticket lookup → none
    tx.supportTicket.findFirst.mockResolvedValue(null);
    tx.supportTicket.create.mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444' });
    tx.supportMessage.create.mockResolvedValue({
      id: MSG,
      author: 'user',
      body: 'otro tema',
      createdAt: new Date(),
    });

    const created = await createUserSupportMessage({
      walletAddress: WALLET,
      profileId: 1,
      body: 'otro tema',
    });
    expect(created?.kind).toBe('reopened');
    expect(tx.supportTicket.create).toHaveBeenCalled();
  });
});

describe('createTeamSupportMessage', () => {
  const tx = prisma.__tx;

  it('writes on the open ticket and clears resolved', async () => {
    tx.supportConversation.findUnique.mockResolvedValue({ id: CONV, walletAddress: WALLET });
    tx.supportTicket.findFirst.mockResolvedValueOnce({ id: TICKET });
    tx.supportConversation.update.mockResolvedValue({});
    tx.supportTicket.update.mockResolvedValue({});
    tx.supportMessage.create.mockResolvedValue({
      id: MSG,
      author: 'team',
      body: 'ya lo vemos',
      createdAt: new Date('2026-10-31T13:00:00.000Z'),
    });

    const message = await createTeamSupportMessage(CONV, 'ya lo vemos');
    expect(message?.author).toBe('team');
    expect(tx.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TICKET },
        data: expect.objectContaining({ lastMessageAuthor: 'team', resolvedAt: null }),
      }),
    );
  });

  it('returns null when the conversation is missing', async () => {
    tx.supportConversation.findUnique.mockResolvedValue(null);
    expect(await createTeamSupportMessage(CONV, 'hola')).toBeNull();
  });
});

describe('setSupportConversationResolved', () => {
  const tx = prisma.__tx;

  it('closes every open ticket when resolving', async () => {
    tx.supportConversation.findUnique.mockResolvedValue({ id: CONV });
    tx.supportConversation.update.mockResolvedValue({});
    tx.supportTicket.updateMany.mockResolvedValue({ count: 2 });

    expect(await setSupportConversationResolved(CONV, true)).toBe(true);
    expect(tx.supportTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: CONV, resolvedAt: null },
        data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
      }),
    );
  });

  it('reopens the last ticket when un-resolving', async () => {
    tx.supportConversation.findUnique.mockResolvedValue({ id: CONV });
    tx.supportConversation.update.mockResolvedValue({});
    tx.supportTicket.findFirst.mockResolvedValue({ id: TICKET });
    tx.supportTicket.update.mockResolvedValue({});

    expect(await setSupportConversationResolved(CONV, false)).toBe(true);
    expect(tx.supportTicket.update).toHaveBeenCalledWith({
      where: { id: TICKET },
      data: { resolvedAt: null },
    });
  });
});

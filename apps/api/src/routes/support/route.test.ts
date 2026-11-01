import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/walletAuth', () => ({
  requireSessionWallet: (_req: unknown, res: { locals: Record<string, unknown> }, next: () => void) => {
    res.locals.sessionWallet = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    next();
  },
  getSessionWallet: (res: { locals: { sessionWallet: string } }) => res.locals.sessionWallet,
}));

vi.mock('../../lib/supportAlerts', () => ({
  notifySupportMessage: vi.fn(),
}));

vi.mock('@vaquita/shared', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getProfile: vi.fn(async () => ({ profileData: { id: 7, nickname: 'vaquero' }, error: null })),
    countRecentSupportMessages: vi.fn(async () => 0),
    createUserSupportMessage: vi.fn(),
    getSupportThreadForWallet: vi.fn(async () => []),
    listSupportTicketsForWallet: vi.fn(async () => []),
    getSupportTicketForWallet: vi.fn(async () => null),
  };
});

const {
  createUserSupportMessage,
  getSupportTicketForWallet,
  listSupportTicketsForWallet,
  countRecentSupportMessages,
} = await import('@vaquita/shared');
const { notifySupportMessage } = await import('../../lib/supportAlerts');
const { default: supportRouter } = await import('./route');

const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const TICKET = '22222222-2222-4222-8222-222222222222';
const MSG = {
  id: '33333333-3333-4333-8333-333333333333',
  author: 'user' as const,
  body: 'hola',
  createdAt: '2026-10-31T12:00:00.000Z',
};

let base: string;
let server: ReturnType<express.Express['listen']>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = { error: () => {}, warn: () => {}, info: () => {} };
    next();
  });
  app.use('/support', supportRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(countRecentSupportMessages).mockResolvedValue(0);
});

describe('GET /support/tickets', () => {
  it('returns an empty list with 200, never 404', async () => {
    vi.mocked(listSupportTicketsForWallet).mockResolvedValue([]);
    const res = await fetch(`${base}/support/tickets`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'success', data: { tickets: [] } });
  });
});

describe('GET /support/tickets/:id', () => {
  it('404s for a bad id or a ticket that is not theirs', async () => {
    expect((await fetch(`${base}/support/tickets/not-a-uuid`)).status).toBe(404);
    vi.mocked(getSupportTicketForWallet).mockResolvedValue(null);
    expect((await fetch(`${base}/support/tickets/${TICKET}`)).status).toBe(404);
  });

  it('returns the ticket detail', async () => {
    vi.mocked(getSupportTicketForWallet).mockResolvedValue({
      id: TICKET,
      subject: 'hola',
      status: 'waiting',
      openedAt: MSG.createdAt,
      resolvedAt: null,
      lastMessageAt: MSG.createdAt,
      lastMessage: MSG,
      messages: [MSG],
    });
    const res = await fetch(`${base}/support/tickets/${TICKET}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { ticket: { id: string } } };
    expect(body.data.ticket.id).toBe(TICKET);
  });
});

describe('POST /support/messages', () => {
  it('returns message and ticketId, and alerts with ticketId', async () => {
    vi.mocked(createUserSupportMessage).mockResolvedValue({
      message: MSG,
      conversationId: '11111111-1111-4111-8111-111111111111',
      ticketId: TICKET,
      kind: 'new',
    });
    const res = await fetch(`${base}/support/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'hola' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'success', data: { message: MSG, ticketId: TICKET } });
    expect(notifySupportMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: TICKET, kind: 'new', walletAddress: WALLET }),
      expect.anything(),
    );
  });

  it('404s when the ticketId is not owned', async () => {
    vi.mocked(createUserSupportMessage).mockResolvedValue(null);
    const res = await fetch(`${base}/support/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'hola', ticketId: TICKET }),
    });
    expect(res.status).toBe(404);
  });

  it('429s when the hourly cap is hit', async () => {
    vi.mocked(countRecentSupportMessages).mockResolvedValue(60);
    const res = await fetch(`${base}/support/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'hola' }),
    });
    expect(res.status).toBe(429);
  });
});

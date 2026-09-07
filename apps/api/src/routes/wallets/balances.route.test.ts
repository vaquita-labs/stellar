import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vaquita/shared/services/wallets/onchainBalances', () => ({
  LAZY_REFRESH_MAX_AGE_MS: 600_000,
  getSupportedTokenIds: vi.fn(async () => [2]),
  lazyRefreshWalletBalances: vi.fn(async () => true),
}));

vi.mock('@vaquita/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, prisma: { walletBalance: { findMany: vi.fn(async () => []) } } };
});

const { getSupportedTokenIds, lazyRefreshWalletBalances } = await import(
  '@vaquita/shared/services/wallets/onchainBalances'
);
const { prisma } = await import('@vaquita/db');
const { issueSessionToken } = await import('../../lib/walletAuth');
const { default: balancesRouter } = await import('./balances.route');

const refresh = vi.mocked(lazyRefreshWalletBalances);
const tokenIds = vi.mocked(getSupportedTokenIds);
const findMany = vi.mocked(prisma.walletBalance.findMany);

const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const OTHER = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBQ';

let base: string;
let server: ReturnType<express.Express['listen']>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // The real API stamps `req.log` in a middleware; the route only ever calls
  // it on the failure path.
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = { error: () => {}, warn: () => {}, info: () => {} };
    next();
  });
  app.use('/wallets/balances', balancesRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  refresh.mockResolvedValue(true);
  tokenIds.mockResolvedValue([2]);
  findMany.mockResolvedValue([] as never);
});

type RefreshBody = {
  data: {
    refreshed: boolean;
    balances: Record<string, unknown>[];
  };
};

const post = (body: unknown, token?: string) =>
  fetch(`${base}/wallets/balances/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

describe('POST /wallets/balances/refresh', () => {
  it('rejects an unauthenticated caller', async () => {
    const res = await post({});

    expect(res.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rejects a forged token', async () => {
    const res = await post({}, 'not.a.token');

    expect(res.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes the session wallet under the default TTL', async () => {
    const { token } = issueSessionToken(WALLET);

    const res = await post({}, token);
    const body = (await res.json()) as RefreshBody;

    expect(res.status).toBe(200);
    expect(body.data.refreshed).toBe(true);
    expect(refresh).toHaveBeenCalledWith(WALLET, { maxAgeMs: 600_000 });
  });

  it('forces a read when the caller knows the balance moved', async () => {
    const { token } = issueSessionToken(WALLET);

    await post({ force: true }, token);

    expect(refresh).toHaveBeenCalledWith(WALLET, { maxAgeMs: 0 });
  });

  it('never reads a wallet other than the session’s', async () => {
    const { token } = issueSessionToken(WALLET);

    // The body names someone else's wallet; the route must ignore it entirely,
    // or this becomes a way to drive RPC reads against any address.
    await post({ wallet: OTHER, walletAddress: OTHER, force: true }, token);

    expect(refresh).toHaveBeenCalledWith(WALLET, { maxAgeMs: 0 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { walletAddress: WALLET, tokenId: { in: [2] } } }),
    );
  });

  it('reports that no read happened when the snapshot was still fresh', async () => {
    refresh.mockResolvedValue(false);
    const { token } = issueSessionToken(WALLET);

    const body = (await (await post({}, token)).json()) as RefreshBody;

    expect(body.data.refreshed).toBe(false);
  });

  it('returns the snapshot with the age of the reading beside it', async () => {
    const scrapedAt = new Date('2026-09-07T12:00:00.000Z');
    findMany.mockResolvedValue([
      { tokenId: 2, blendUsdc: 10, vaultUsdc: 250, vaultUsdcHours: 1250, scrapedAt, observedAt: scrapedAt, lastError: null },
    ] as never);
    const { token } = issueSessionToken(WALLET);

    const body = (await (await post({}, token)).json()) as RefreshBody;

    expect(body.data.balances).toEqual([
      {
        tokenId: 2,
        blendUsdc: 10,
        vaultUsdc: 250,
        vaultUsdcHours: 1250,
        scrapedAt: '2026-09-07T12:00:00.000Z',
        observedAt: '2026-09-07T12:00:00.000Z',
        lastError: null,
      },
    ]);
  });

  it('skips the snapshot query when no token is supported', async () => {
    tokenIds.mockResolvedValue([]);
    const { token } = issueSessionToken(WALLET);

    const body = (await (await post({}, token)).json()) as RefreshBody;

    expect(findMany).not.toHaveBeenCalled();
    expect(body.data.balances).toEqual([]);
  });

  it('fails the request rather than hanging when the refresh throws', async () => {
    refresh.mockRejectedValue(new Error('rpc down'));
    const { token } = issueSessionToken(WALLET);

    const res = await post({}, token);

    expect(res.status).toBe(500);
  });
});

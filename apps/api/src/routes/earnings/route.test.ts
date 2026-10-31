import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vaquita/shared', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getNetworkByName: vi.fn(async (name: string) => ({ data: name === 'Stellar' ? { id: 1, name } : null, error: null })),
    getTokenBySymbol: vi.fn(async (symbol: string) =>
      symbol === 'USDC' ? { data: { id: 2, symbol: 'USDC' }, error: null } : { data: null, error: null },
    ),
    getPassiveEarnings: vi.fn(async (input: unknown) => ({ echo: input })),
  };
});

const { getPassiveEarnings, getTokenBySymbol } = await import('@vaquita/shared');
const { default: earningsRouter } = await import('./route');

const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
let base: string;
let server: ReturnType<express.Express['listen']>;

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = { error: () => {}, warn: () => {}, info: () => {} };
    next();
  });
  app.use('/earnings', earningsRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

beforeEach(() => {
  vi.mocked(getPassiveEarnings).mockImplementation(async (input: unknown) => ({ echo: input }) as never);
});

describe('GET /earnings/network/:network/wallet/:wallet', () => {
  it('reads the wallet with the defaults of the period', async () => {
    const res = await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?period=monthly&tz=America/La_Paz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { echo: Record<string, unknown> } };
    expect(body.data.echo).toMatchObject({ walletAddress: WALLET, tokenId: 2, period: 'monthly', count: 6, timeZone: 'America/La_Paz' });
    expect(vi.mocked(getPassiveEarnings)).toHaveBeenCalled();
  });

  it('defaults to daily, seven buckets, UTC and USDC when the query is empty', async () => {
    const res = await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { echo: Record<string, unknown> } };
    expect(body.data.echo).toMatchObject({
      walletAddress: WALLET,
      tokenId: 2,
      period: 'daily',
      count: 7,
      timeZone: 'UTC',
    });
    expect(vi.mocked(getTokenBySymbol)).toHaveBeenCalledWith('USDC');
  });

  it('defaults yearly to three buckets', async () => {
    const res = await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?period=yearly`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { echo: Record<string, unknown> } };
    expect(body.data.echo).toMatchObject({ period: 'yearly', count: 3 });
  });

  it('returns the PassiveEarnings shape the home chart reads', async () => {
    vi.mocked(getPassiveEarnings).mockResolvedValue({
      currency: 'USDC',
      period: 'daily',
      timeZone: 'America/La_Paz',
      buckets: [
        {
          start: '2026-10-27T04:00:00.000Z',
          end: '2026-10-28T04:00:00.000Z',
          earned: 0.42,
          estimated: false,
        },
      ],
      totalEarned: 1.25,
      firstSampleAt: '2026-10-20T12:00:00.000Z',
      asOf: '2026-10-28T19:00:00.000Z',
    } as never);

    const res = await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?period=daily&tz=America/La_Paz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      currency: 'USDC',
      period: 'daily',
      timeZone: 'America/La_Paz',
      totalEarned: 1.25,
      firstSampleAt: '2026-10-20T12:00:00.000Z',
      asOf: '2026-10-28T19:00:00.000Z',
    });
    expect(body.data.buckets).toEqual([
      {
        start: '2026-10-27T04:00:00.000Z',
        end: '2026-10-28T04:00:00.000Z',
        earned: 0.42,
        estimated: false,
      },
    ]);
  });

  it('refuses what it cannot read', async () => {
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/not-a-wallet`)).status).toBe(400);
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?period=hourly`)).status).toBe(400);
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?count=0`)).status).toBe(400);
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?count=999`)).status).toBe(400);
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?tz=Nowhere/Land`)).status).toBe(400);
    expect((await fetch(`${base}/earnings/network/Nope/wallet/${WALLET}`)).status).toBe(404);
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?token=NOPE`)).status).toBe(404);
  });
});

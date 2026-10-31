import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@vaquita/shared', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getNetworkByName: vi.fn(async (name: string) => ({ data: name === 'Stellar' ? { id: 1, name } : null, error: null })),
    getTokenBySymbol: vi.fn(async () => ({ data: { id: 2, symbol: 'USDC' }, error: null })),
    getPassiveEarnings: vi.fn(async (input: unknown) => ({ echo: input })),
  };
});

const { getPassiveEarnings } = await import('@vaquita/shared');
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

describe('GET /earnings/network/:network/wallet/:wallet', () => {
  it('reads the wallet with the defaults of the period', async () => {
    const res = await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?period=monthly&tz=America/La_Paz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { echo: Record<string, unknown> } };
    expect(body.data.echo).toMatchObject({ walletAddress: WALLET, tokenId: 2, period: 'monthly', count: 6, timeZone: 'America/La_Paz' });
    expect(vi.mocked(getPassiveEarnings)).toHaveBeenCalled();
  });

  it('refuses what it cannot read', async () => {
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/not-a-wallet`)).status).toBe(400);
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?period=hourly`)).status).toBe(400);
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?count=0`)).status).toBe(400);
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?count=999`)).status).toBe(400);
    expect((await fetch(`${base}/earnings/network/Stellar/wallet/${WALLET}?tz=Nowhere/Land`)).status).toBe(400);
    expect((await fetch(`${base}/earnings/network/Nope/wallet/${WALLET}`)).status).toBe(404);
  });
});

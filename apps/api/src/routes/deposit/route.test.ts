import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vaquita/shared', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    verifyTxSucceeded: vi.fn(async () => 'SUCCESS'),
    verifyDepositTransactionForRow: vi.fn(),
    verifyWithdrawTransactionForRow: vi.fn(),
    confirmDepositWithTx: vi.fn(async () => ({ data: null, error: null, transitioned: false })),
    failDepositWithTx: vi.fn(),
    creteConfirmWithdrawal: vi.fn(async () => ({ data: { deposit: { walletAddress: 'G' } }, error: null })),
    getWithdrawalByTransactionHash: vi.fn(async () => ({ data: null, error: null })),
    getNextDepositNonce: vi.fn(async () => ({ data: { nonce: '2' }, error: null })),
    createDepositByNames: vi.fn(async () => ({ data: { id: 1 }, error: null })),
    grantDepositCoinsForWallet: vi.fn(async () => 0),
  };
});

vi.mock('../../lib/walletBalanceRefresh', () => ({ refreshWalletBalanceAfterEvent: vi.fn() }));

const shared = await import('@vaquita/shared');
const { default: depositRouter } = await import('./route');

const verifyDeposit = vi.mocked(shared.verifyDepositTransactionForRow);
const verifyWithdraw = vi.mocked(shared.verifyWithdrawTransactionForRow);
const confirmDeposit = vi.mocked(shared.confirmDepositWithTx);
const failDeposit = vi.mocked(shared.failDepositWithTx);
const confirmWithdrawal = vi.mocked(shared.creteConfirmWithdrawal);
const createDeposit = vi.mocked(shared.createDepositByNames);

const HASH = 'a'.repeat(64);
const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

let base: string;
let server: ReturnType<express.Express['listen']>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = {
      error: () => {},
      warn: () => {},
      info: () => {},
      child: () => ({ error: () => {}, warn: () => {}, info: () => {} }),
    };
    next();
  });
  app.use('/deposit', depositRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

const post = (path: string, body: unknown) =>
  fetch(`${base}/deposit${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /deposit/confirm', () => {
  it('refuses a landed transaction that is not this row deposit', async () => {
    verifyDeposit.mockResolvedValue({ ok: false, status: 409, reason: 'Transaction does not contain this deposit' });

    const res = await post('/confirm', { id: 1, txHash: HASH, depositIdHex: 'ff' });

    expect(res.status).toBe(409);
    expect(confirmDeposit).not.toHaveBeenCalled();
  });

  it('records the position id read from the chain, not the client one', async () => {
    verifyDeposit.mockResolvedValue({ ok: true, event: { depositId: 'chainid' } as never });

    const res = await post('/confirm', { id: 1, txHash: HASH, depositIdHex: 'clientid', transactionRaw: '' });

    expect(res.status).toBe(200);
    expect(confirmDeposit).toHaveBeenCalledWith(1, 'chainid', HASH, '');
  });

  it('rejects a malformed hash before touching the chain', async () => {
    const res = await post('/confirm', { id: 1, txHash: 'not-a-hash' });

    expect(res.status).toBe(400);
    expect(verifyDeposit).not.toHaveBeenCalled();
  });
});

describe('POST /deposit/fail', () => {
  it('will not fail a deposit that is no longer initiated', async () => {
    failDeposit.mockResolvedValue({ data: null, error: null, notInitiated: true });

    const res = await post('/fail', { id: 1 });

    expect(res.status).toBe(409);
  });
});

describe('POST /deposit/withdraw-confirm', () => {
  it('refuses a hash that does not withdraw this position', async () => {
    verifyWithdraw.mockResolvedValue({ ok: false, status: 409, reason: 'Transaction does not withdraw this position' });

    const res = await post('/withdraw-confirm', { depositId: 1, txHash: HASH });

    expect(res.status).toBe(409);
    expect(confirmWithdrawal).not.toHaveBeenCalled();
  });

  it('records a verified withdrawal', async () => {
    verifyWithdraw.mockResolvedValue({ ok: true, event: {} as never });

    const res = await post('/withdraw-confirm', { depositId: 1, txHash: HASH });

    expect(res.status).toBe(200);
    expect(confirmWithdrawal).toHaveBeenCalledWith(expect.objectContaining({ depositId: 1, transactionHash: HASH }));
  });
});

describe('POST /deposit', () => {
  const payload = {
    networkName: 'Stellar',
    walletAddress: WALLET,
    amount: 5,
    tokenSymbol: 'USDC',
    lockPeriod: 604_800_000,
    vaquitaContract: 'CPOOL',
  };

  it('rejects a nonce past the wallet next nonce', async () => {
    const res = await post('/', { ...payload, nonce: '9223372036854775807' });

    expect(res.status).toBe(400);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it('rejects a wallet that is not a Stellar account', async () => {
    const res = await post('/', { ...payload, walletAddress: 'nope', nonce: '2' });

    expect(res.status).toBe(400);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it('accepts the next nonce', async () => {
    const res = await post('/', { ...payload, nonce: '2' });

    expect(res.status).toBe(200);
    expect(createDeposit).toHaveBeenCalled();
  });
});

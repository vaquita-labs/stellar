import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateMany, findMany, findUnique, notify, push } = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  notify: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@vaquita/db', () => ({
  prisma: {
    depositIntent: { updateMany },
    walletTransfer: { findMany },
    profile: { findUnique },
  },
  Prisma: {},
}));
vi.mock('../notifications', () => ({ notify }));
vi.mock('../notifications/pushSender', () => ({ sendWebPushToWallet: push }));
vi.mock('../project-config', () => ({
  getProjectConfig: vi.fn(),
  getDepositPlatforms: vi.fn(async () => [{ id: 'binance', name: 'Binance' }]),
}));

import { type HorizonPaymentRecord, pickArrivalPayment, settleArrivedIntent } from './arrival';

const WALLET = 'GUSER';
const ISSUER = 'GCIRCLE';
const SINCE = new Date('2026-10-13T12:00:00Z');

const payment = (overrides: Partial<HorizonPaymentRecord> = {}): HorizonPaymentRecord => ({
  id: 'op-1',
  type: 'payment',
  created_at: '2026-10-13T12:05:00Z',
  transaction_hash: 'tx-1',
  transaction_successful: true,
  from: 'GBINANCE',
  to: WALLET,
  amount: '10.0000000',
  asset_type: 'credit_alphanum4',
  asset_code: 'USDC',
  asset_issuer: ISSUER,
  ...overrides,
});

const pick = (records: HorizonPaymentRecord[]) =>
  pickArrivalPayment(records, { walletAddress: WALLET, usdcIssuers: [ISSUER], since: SINCE });

describe('pickArrivalPayment', () => {
  it('finds a USDC payment into the wallet since the intent opened', () => {
    expect(pick([payment()])).toEqual({ txHash: 'tx-1', operationId: 'op-1', amount: 10, from: 'GBINANCE' });
  });

  it('accepts a path payment that delivers USDC', () => {
    expect(pick([payment({ type: 'path_payment_strict_send' })])).not.toBeNull();
  });

  it.each([
    ['another issuer', { asset_issuer: 'GOTHER' }],
    ['XLM', { asset_type: 'native', asset_code: undefined, asset_issuer: undefined }],
    ['a payment out of the wallet', { from: WALLET, to: 'GELSE' }],
    ['the user paying themselves', { from: WALLET }],
    ['a payment before the intent', { created_at: '2026-10-13T11:00:00Z' }],
    ['dust', { amount: '0.0010000' }],
    ['a failed transaction', { transaction_successful: false }],
    ['a non-payment operation', { type: 'create_account' }],
  ])('ignores %s', (_label, overrides) => {
    expect(pick([payment(overrides as Partial<HorizonPaymentRecord>)])).toBeNull();
  });

  it('allows a minute of clock skew before the intent', () => {
    expect(pick([payment({ created_at: '2026-10-13T11:59:30Z' })])).not.toBeNull();
  });

  it('picks the earliest matching payment', () => {
    const later = payment({ id: 'op-2', transaction_hash: 'tx-2', created_at: '2026-10-13T13:00:00Z' });
    expect(pick([later, payment()])?.operationId).toBe('op-1');
  });
});

describe('settleArrivedIntent', () => {
  const INTENT = { id: 'intent-1', profileId: 7, walletAddress: WALLET, platformId: 'binance' };
  const FOUND = { txHash: 'tx-1', operationId: 'op-1', amount: 10, from: 'GBINANCE' };

  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ language: 'es' });
  });

  it('closes the intent and notifies once when this call closed it', async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await expect(settleArrivedIntent(INTENT, FOUND)).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'intent-1', status: 'open' } }));
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ messageKey: 'depositReceived', params: { amount: '10.00', platform: 'Binance' } }),
    );
    expect(push).toHaveBeenCalledWith(WALLET, expect.objectContaining({ title: 'Llegó tu depósito' }));
  });

  it('stays quiet when another path already closed it', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(settleArrivedIntent(INTENT, FOUND)).resolves.toBe(false);
    expect(notify).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';

// The builder is pure; the module still imports prisma and the push sender.
vi.mock('@vaquita/db', () => ({ prisma: {}, Prisma: {} }));
vi.mock('../notifications', () => ({ notify: vi.fn() }));
vi.mock('../notifications/pushSender', () => ({ sendWebPushToWallet: vi.fn() }));

import { DEPOSIT_RECEIVED_LINK, buildDepositReceivedNotice } from './depositReceivedNotice';

const INPUT = { intentId: 'intent-1', walletAddress: 'GUSER', amount: 25, platformName: 'Binance' };

describe('buildDepositReceivedNotice', () => {
  it('builds the in-app notification keyed by the intent', () => {
    expect(buildDepositReceivedNotice(INPUT).notification).toEqual({
      walletAddress: 'GUSER',
      type: 'deposit',
      messageKey: 'depositReceived',
      params: { amount: '25.00', platform: 'Binance' },
      link: DEPOSIT_RECEIVED_LINK,
      dedupeKey: 'deposit-received-intent-1',
    });
  });

  it('tags the push with the dedupe key so repeats collapse', () => {
    const { push } = buildDepositReceivedNotice(INPUT);
    expect(push).toEqual({
      title: 'Your deposit arrived',
      body: 'You received 25.00 USDC from Binance.',
      link: DEPOSIT_RECEIVED_LINK,
      tag: 'deposit-received-intent-1',
    });
  });

  it("writes the push in the user's language, falling back to English", () => {
    expect(buildDepositReceivedNotice({ ...INPUT, language: 'es' }).push).toMatchObject({
      title: 'Llegó tu depósito',
      body: 'Recibiste 25.00 USDC desde Binance.',
    });
    expect(buildDepositReceivedNotice({ ...INPUT, language: 'pt' }).push.title).toBe('Seu depósito chegou');
    expect(buildDepositReceivedNotice({ ...INPUT, language: 'fr' }).push.title).toBe('Your deposit arrived');
  });
});

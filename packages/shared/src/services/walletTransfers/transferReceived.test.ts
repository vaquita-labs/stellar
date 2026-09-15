import { describe, expect, it, vi } from 'vitest';

// The builder is pure; the module still imports prisma and the push sender.
vi.mock('@vaquita/db', () => ({ prisma: {}, Prisma: {} }));
vi.mock('../notifications', () => ({ notify: vi.fn() }));
vi.mock('../notifications/pushSender', () => ({ sendWebPushToWallet: vi.fn() }));

import { TRANSFER_RECEIVED_LINK, buildTransferReceivedNotice } from './transferReceived';

const TRANSFER = {
  id: 'abc-123',
  walletAddress: 'GSENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWXYZ',
  amount: 12.5,
  destinationAddress: 'GRECEIVER',
  destinationKind: 'vaquita_user' as const,
};

describe('buildTransferReceivedNotice', () => {
  it('notifies the receiver of a first-time payment to a Vaquita user', () => {
    const notice = buildTransferReceivedNotice({ transfer: TRANSFER, inserted: true, senderNickname: 'ana' });

    expect(notice?.notification).toEqual({
      walletAddress: 'GRECEIVER',
      type: 'deposit',
      messageKey: 'transferReceived',
      params: { name: '@ana', amount: '12.50' },
      link: TRANSFER_RECEIVED_LINK,
      dedupeKey: 'transfer-received-abc-123',
    });
    expect(notice?.push.body).toBe('@ana sent you 12.50 USDC.');
  });

  it('says nothing for a payment that left the app', () => {
    expect(
      buildTransferReceivedNotice({ transfer: { ...TRANSFER, destinationKind: 'external' }, inserted: true }),
    ).toBeNull();
  });

  it('says nothing on a retry of an already recorded hash', () => {
    expect(buildTransferReceivedNotice({ transfer: TRANSFER, inserted: false, senderNickname: 'ana' })).toBeNull();
  });

  it('names a sender without a tag by a shortened address', () => {
    const notice = buildTransferReceivedNotice({ transfer: TRANSFER, inserted: true, senderNickname: null });
    expect(notice?.notification.params?.name).toBe('GSEN…WXYZ');
  });

  it("writes the push in the receiver's language, falling back to English", () => {
    const es = buildTransferReceivedNotice({ transfer: TRANSFER, inserted: true, senderNickname: 'ana', receiverLanguage: 'es' });
    expect(es?.push).toMatchObject({ title: 'Recibiste dinero', body: '@ana te envió 12.50 USDC.' });

    const unknown = buildTransferReceivedNotice({ transfer: TRANSFER, inserted: true, receiverLanguage: 'fr' });
    expect(unknown?.push.title).toBe('You received money');
  });
});

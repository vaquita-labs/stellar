import { describe, expect, it, vi } from 'vitest';

// The builder is pure; the module still imports prisma and the push sender.
vi.mock('@vaquita/db', () => ({ prisma: {}, Prisma: {} }));
vi.mock('../notifications', () => ({ notify: vi.fn() }));
vi.mock('../notifications/pushSender', () => ({ sendWebPushToWallet: vi.fn() }));

import { RAMP_SETTLED_LINK, buildRampSettledNotice } from './rampSettledNotice';

const ROW = { id: 'row-1', walletAddress: 'GUSER', amountFiat: '100', currency: 'BOB' };

describe('buildRampSettledNotice', () => {
  it('tells the user a purchase landed, in the USDC it credited', () => {
    const notice = buildRampSettledNotice({ kind: 'onramp', row: ROW, status: 'settled', changed: true, usdcAmount: 13.5173 });

    expect(notice?.notification).toEqual({
      walletAddress: 'GUSER',
      type: 'deposit',
      messageKey: 'onrampSettled',
      params: { amount: '13.52', currency: 'USDC' },
      link: RAMP_SETTLED_LINK,
      dedupeKey: 'onramp-settled-row-1',
    });
    expect(notice?.push.tag).toBe('onramp-settled-row-1');
  });

  it('falls back to the local amount paid when nobody could read the USDC', () => {
    const notice = buildRampSettledNotice({ kind: 'onramp', row: ROW, status: 'settled', changed: true });
    expect(notice?.notification.params).toEqual({ amount: '100.00', currency: 'BOB' });
  });

  it('tells the user a withdrawal reached their bank, in local currency', () => {
    const notice = buildRampSettledNotice({
      kind: 'offramp',
      row: ROW,
      status: 'settled',
      changed: true,
      usdcAmount: 14,
      language: 'es',
    });

    expect(notice?.notification.messageKey).toBe('offrampSettled');
    expect(notice?.notification.params).toEqual({ amount: '100.00', currency: 'BOB' });
    expect(notice?.notification.dedupeKey).toBe('offramp-settled-row-1');
    expect(notice?.push.title).toBe('Tu retiro se completó');
  });

  it('says nothing when this close did not change the row', () => {
    expect(buildRampSettledNotice({ kind: 'onramp', row: ROW, status: 'settled', changed: false })).toBeNull();
  });

  it('says nothing for an outcome other than settled', () => {
    expect(buildRampSettledNotice({ kind: 'offramp', row: ROW, status: 'failed', changed: true })).toBeNull();
  });
});

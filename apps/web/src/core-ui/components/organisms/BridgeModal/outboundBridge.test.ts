import { describe, expect, it, vi } from 'vitest';
import { payableAmount, withdrawRequestAmount } from '@/networks/stellar/withdrawAmounts';
import { TxPendingError } from '@/networks/stellar/pollarError';
import { WithdrawPaymentError } from '@/networks/stellar/withdrawError';
import {
  gateOutboundPay,
  outboundAvailableUsdc,
  payOutboundFromSavings,
  type OutboundPayDeps,
  type OutboundPayInput,
} from './outboundBridge';

const MEMO = { type: 'id' as const, value: '12345' };

const freshInput = (overrides: Partial<OutboundPayInput> = {}): OutboundPayInput => ({
  direction: 'stellar_to_evm',
  amount: '10',
  decimals: 7,
  withdrawAll: false,
  walletAddress: 'GUSER',
  depositAddress: 'GDEPOSIT',
  memo: MEMO,
  rawMemo: '12345',
  destinationLabel: 'GDEPOSIT',
  unpaid: null,
  ...overrides,
});

const depsOf = (overrides: Partial<OutboundPayDeps> = {}): OutboundPayDeps => ({
  readUsdcBalance: vi.fn(async () => 0),
  passiveWithdraw: vi.fn(async () => ({ hash: 'whash', amount: '10.0001000' })),
  awaitUsdcCredit: vi.fn(async () => 100001000n),
  sponsoredUsdcPayment: vi.fn(async () => ({ hash: 'phash' })),
  invalidateAfterWithdraw: vi.fn(async () => {}),
  isQuoteExpired: vi.fn(() => false),
  ...overrides,
});

describe('outboundAvailableUsdc', () => {
  it('floors the passive position and does not add idle classic USDC', () => {
    expect(outboundAvailableUsdc({ direction: 'stellar_to_evm', passiveLiveUsdc: 10.123456789, classicIdleUsdc: 4 })).toBe(
      10.1234567,
    );
    expect(outboundAvailableUsdc({ direction: 'stellar_to_evm', passiveLiveUsdc: 12.5, classicIdleUsdc: 0 })).toBe(12.5);
    expect(outboundAvailableUsdc({ direction: 'evm_to_stellar', passiveLiveUsdc: 12.5, classicIdleUsdc: 4 })).toBeNull();
  });
});

describe('payOutboundFromSavings', () => {
  it('withdraws a partial with dust, then pays the requested figure when the credit covers it', async () => {
    // WITHDRAW_DUST_STR is 0.0001, so a payment leg on 10 asks the vault for 10.0001000.
    const request = withdrawRequestAmount('10', 7, { hasPaymentLeg: true });
    expect(request).toBe('10.0001000');

    const deps = depsOf();
    const result = await payOutboundFromSavings(freshInput(), deps);

    expect(result).toEqual({ hash: 'phash' });
    expect(deps.readUsdcBalance).toHaveBeenCalledTimes(1);
    expect(deps.readUsdcBalance).toHaveBeenCalledWith('GUSER', 7);
    expect(deps.passiveWithdraw).toHaveBeenCalledTimes(1);
    expect(deps.passiveWithdraw).toHaveBeenCalledWith({
      address: 'GUSER',
      amount: request,
      decimals: 7,
      withdrawAll: false,
      flowKind: 'external_out',
    });
    expect(deps.awaitUsdcCredit).toHaveBeenCalledTimes(1);
    expect(deps.awaitUsdcCredit).toHaveBeenCalledWith('GUSER', 7, 0, { hash: 'whash' });
    expect(deps.sponsoredUsdcPayment).toHaveBeenCalledTimes(1);
    expect(deps.sponsoredUsdcPayment).toHaveBeenCalledWith({
      to: 'GDEPOSIT',
      amount: '10.0000000',
      memo: MEMO,
    });
    expect(deps.invalidateAfterWithdraw).toHaveBeenCalledTimes(1);

    const readAt = vi.mocked(deps.readUsdcBalance).mock.invocationCallOrder[0];
    const withdrawAt = vi.mocked(deps.passiveWithdraw).mock.invocationCallOrder[0];
    const refreshAt = vi.mocked(deps.invalidateAfterWithdraw).mock.invocationCallOrder[0];
    const creditAt = vi.mocked(deps.awaitUsdcCredit).mock.invocationCallOrder[0];
    const payAt = vi.mocked(deps.sponsoredUsdcPayment).mock.invocationCallOrder[0];
    expect(readAt).toBeLessThan(withdrawAt);
    expect(withdrawAt).toBeLessThan(refreshAt);
    expect(refreshAt).toBeLessThan(creditAt);
    expect(creditAt).toBeLessThan(payAt);
  });

  it('pays the credit when a partial lands short of the request', async () => {
    // 99999999n is 9.9999999 USDC, which covers a 1 USDC request, so it is not
    // the short credit. One stroop under 1 USDC is 9999999n, and payableAmount
    // formats that as 0.9999999. The plan's 99999999n was one zero too many.
    const credited = 9999999n;
    expect(payableAmount(credited, '1', 7, { withdrawAll: false })).toBe('0.9999999');
    const request = withdrawRequestAmount('1', 7, { hasPaymentLeg: true });
    expect(request).toBe('1.0001000');

    const deps = depsOf({
      passiveWithdraw: vi.fn(async () => ({ hash: 'whash', amount: request })),
      awaitUsdcCredit: vi.fn(async () => credited),
    });

    await payOutboundFromSavings(freshInput({ amount: '1' }), deps);

    expect(deps.passiveWithdraw).toHaveBeenCalledTimes(1);
    expect(deps.passiveWithdraw).toHaveBeenCalledWith({
      address: 'GUSER',
      amount: request,
      decimals: 7,
      withdrawAll: false,
      flowKind: 'external_out',
    });
    expect(deps.sponsoredUsdcPayment).toHaveBeenCalledWith({
      to: 'GDEPOSIT',
      amount: '0.9999999',
      memo: MEMO,
    });
  });

  it('pays the whole credit when the user tapped Available', async () => {
    // withdrawAll sends the credit, including interest the typed amount does not have.
    const credited = 100004200n;
    expect(payableAmount(credited, '10', 7, { withdrawAll: true })).toBe('10.0004200');

    const deps = depsOf({
      awaitUsdcCredit: vi.fn(async () => credited),
    });

    await payOutboundFromSavings(freshInput({ withdrawAll: true }), deps);

    expect(deps.passiveWithdraw).toHaveBeenCalledTimes(1);
    expect(deps.passiveWithdraw).toHaveBeenCalledWith({
      address: 'GUSER',
      amount: '10',
      decimals: 7,
      withdrawAll: true,
      flowKind: 'external_out',
    });
    expect(deps.sponsoredUsdcPayment).toHaveBeenCalledWith({
      to: 'GDEPOSIT',
      amount: '10.0004200',
      memo: MEMO,
    });
  });

  it('does not withdraw again when the payment fails', async () => {
    const sponsoredUsdcPayment = vi
      .fn()
      .mockRejectedValueOnce(new Error('op_underfunded'))
      .mockResolvedValueOnce({ hash: 'phash' });
    const deps = depsOf({ sponsoredUsdcPayment });

    const error = await payOutboundFromSavings(freshInput(), deps).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WithdrawPaymentError);
    expect((error as WithdrawPaymentError).payment).toEqual({
      address: 'GDEPOSIT',
      amount: '10.0000000',
      memo: '12345',
    });
    expect(deps.passiveWithdraw).toHaveBeenCalledTimes(1);

    vi.mocked(deps.readUsdcBalance).mockClear();
    vi.mocked(deps.passiveWithdraw).mockClear();
    vi.mocked(deps.awaitUsdcCredit).mockClear();
    vi.mocked(deps.invalidateAfterWithdraw).mockClear();
    sponsoredUsdcPayment.mockClear();

    await payOutboundFromSavings(freshInput({ unpaid: (error as WithdrawPaymentError).payment }), deps);

    expect(deps.readUsdcBalance).not.toHaveBeenCalled();
    expect(deps.passiveWithdraw).not.toHaveBeenCalled();
    expect(deps.awaitUsdcCredit).not.toHaveBeenCalled();
    expect(deps.invalidateAfterWithdraw).not.toHaveBeenCalled();
    expect(sponsoredUsdcPayment).toHaveBeenCalledTimes(1);
    expect(sponsoredUsdcPayment).toHaveBeenCalledWith({
      to: 'GDEPOSIT',
      amount: '10.0000000',
      memo: MEMO,
    });
  });

  it('records the requested amount when the credit never becomes visible, and a retry only pays that', async () => {
    const sponsoredUsdcPayment = vi.fn(async () => ({ hash: 'phash' }));
    const deps = depsOf({
      awaitUsdcCredit: vi.fn(async () => {
        throw new Error('credit not visible');
      }),
      sponsoredUsdcPayment,
    });

    const error = await payOutboundFromSavings(freshInput(), deps).catch((caught: unknown) => caught);

    expect(deps.passiveWithdraw).toHaveBeenCalledTimes(1);
    expect(sponsoredUsdcPayment).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(WithdrawPaymentError);
    expect((error as WithdrawPaymentError).payment.amount).toBe('10');

    vi.mocked(deps.readUsdcBalance).mockClear();
    vi.mocked(deps.passiveWithdraw).mockClear();
    vi.mocked(deps.awaitUsdcCredit).mockClear();

    await payOutboundFromSavings(freshInput({ unpaid: (error as WithdrawPaymentError).payment }), deps);

    expect(deps.passiveWithdraw).not.toHaveBeenCalled();
    expect(sponsoredUsdcPayment).toHaveBeenCalledTimes(1);
    expect(sponsoredUsdcPayment).toHaveBeenCalledWith({
      to: 'GDEPOSIT',
      amount: '10',
      memo: MEMO,
    });
  });

  it('rethrows a payment that is still confirming', async () => {
    const deps = depsOf({
      sponsoredUsdcPayment: vi.fn(async () => {
        throw new TxPendingError('phash');
      }),
    });

    const error = await payOutboundFromSavings(freshInput(), deps).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TxPendingError);
    expect(error).not.toBeInstanceOf(WithdrawPaymentError);
    expect((error as TxPendingError).hash).toBe('phash');
    expect(deps.passiveWithdraw).toHaveBeenCalledTimes(1);
  });

  it('refuses an inbound bridge before touching any dependency', async () => {
    const deps = depsOf();

    await expect(payOutboundFromSavings(freshInput({ direction: 'evm_to_stellar' }), deps)).rejects.toThrow(/Inbound bridge/);

    expect(deps.readUsdcBalance).not.toHaveBeenCalled();
    expect(deps.passiveWithdraw).not.toHaveBeenCalled();
    expect(deps.awaitUsdcCredit).not.toHaveBeenCalled();
    expect(deps.sponsoredUsdcPayment).not.toHaveBeenCalled();
  });

  it('does not pay when the quote expires after the withdraw', async () => {
    let expired = false;
    const deps = depsOf({
      awaitUsdcCredit: vi.fn(async () => {
        expired = true;
        return 100001000n;
      }),
      isQuoteExpired: () => expired,
    });

    const error = await payOutboundFromSavings(freshInput(), deps).catch((caught: unknown) => caught);

    expect(deps.passiveWithdraw).toHaveBeenCalledTimes(1);
    expect(deps.sponsoredUsdcPayment).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(WithdrawPaymentError);
    expect((error as WithdrawPaymentError).payment.amount).toBe('10.0000000');
  });
});

describe('gateOutboundPay', () => {
  it('blocks a missing memo before an expired quote, and passes a resolved memo id', () => {
    expect(gateOutboundPay({ depositAddress: 'GDEPOSIT', depositMemo: '', quoteExpired: false })).toEqual({
      ok: false,
      reason: 'missing_memo',
    });
    expect(gateOutboundPay({ depositAddress: 'GDEPOSIT', depositMemo: null, quoteExpired: false })).toEqual({
      ok: false,
      reason: 'missing_memo',
    });
    expect(gateOutboundPay({ depositAddress: null, depositMemo: '12345', quoteExpired: false })).toEqual({
      ok: false,
      reason: 'missing_memo',
    });
    expect(gateOutboundPay({ depositAddress: 'GDEPOSIT', depositMemo: '12345', quoteExpired: true })).toEqual({
      ok: false,
      reason: 'quote_expired',
    });
    expect(gateOutboundPay({ depositAddress: 'GDEPOSIT', depositMemo: '', quoteExpired: true })).toEqual({
      ok: false,
      reason: 'missing_memo',
    });
    expect(gateOutboundPay({ depositAddress: 'GDEPOSIT', depositMemo: '12345', quoteExpired: false })).toEqual({
      ok: true,
      memo: MEMO,
    });
  });
});

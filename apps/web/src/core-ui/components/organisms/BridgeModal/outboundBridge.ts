import type { BridgeDirection } from '@/core-ui/hooks/useBridge';
import { AMOUNT_DECIMALS, floorAmount } from '@/core-ui/helpers/numbers';
import {
  resolveMemo,
  type StellarMemo,
  type awaitUsdcCredit,
  type readUsdcBalance,
  type sponsoredUsdcPayment,
} from '@/networks/stellar/blendDirect';
import { TxPendingError } from '@/networks/stellar/pollarError';
import type { passiveWithdraw } from '@/networks/stellar/vaultDirect';
import { payableAmount, withdrawRequestAmount } from '@/networks/stellar/withdrawAmounts';
import { WithdrawPaymentError, type PendingWithdrawPayment } from '@/networks/stellar/withdrawError';

/**
 * USDC an outbound Stellar → EVM bridge can actually send.
 *
 * The form used to read idle classic USDC. That balance is 0 once idle funds
 * are swept back into savings, so the form said "not enough" while the passive
 * position still held the money. Inbound bridges do not spend Stellar USDC.
 *
 * `classicIdleUsdc` is accepted so callers can show they are not adding it.
 * It is not part of the figure.
 */
export function outboundAvailableUsdc(input: {
  direction: BridgeDirection;
  passiveLiveUsdc: number;
  classicIdleUsdc: number;
}): number | null {
  if (input.direction === 'evm_to_stellar') return null;
  return floorAmount(input.passiveLiveUsdc, AMOUNT_DECIMALS);
}

/**
 * The two gates that used to live in the pay click, in the same order.
 *
 * A missing memo wins over an expired quote: both mean "do not send", and the
 * memo is what makes a deposit attributable. Sending without one loses the funds
 * even when the quote is still live.
 */
export function gateOutboundPay(input: {
  depositAddress: string | null | undefined;
  depositMemo: string | null | undefined;
  quoteExpired: boolean;
}): { ok: false; reason: 'missing_memo' | 'quote_expired' } | { ok: true; memo: StellarMemo } {
  const memo = resolveMemo(input.depositMemo);
  if (!memo || !input.depositAddress) return { ok: false, reason: 'missing_memo' };
  if (input.quoteExpired) return { ok: false, reason: 'quote_expired' };
  return { ok: true, memo };
}

export interface OutboundPayInput {
  direction: BridgeDirection;
  amount: string;
  decimals: number;
  withdrawAll: boolean;
  walletAddress: string;
  depositAddress: string;
  /** Memo already resolved by `gateOutboundPay`. This function does not resolve it again. */
  memo: StellarMemo;
  /** Memo string stored on the transfer, kept so a retry can show the same one. */
  rawMemo: string | null;
  destinationLabel: string;
  /** Set when a previous attempt already withdrew and only the payment is left. */
  unpaid: PendingWithdrawPayment | null;
}

export interface OutboundPayDeps {
  readUsdcBalance: typeof readUsdcBalance;
  passiveWithdraw: typeof passiveWithdraw;
  awaitUsdcCredit: typeof awaitUsdcCredit;
  sponsoredUsdcPayment: typeof sponsoredUsdcPayment;
  invalidateAfterWithdraw: () => Promise<void>;
  /** Read at payment time so a quote that dies during the withdraw is still seen. */
  isQuoteExpired: () => boolean;
}

/**
 * Outbound bridge: withdraw USDC from savings, then pay the 1Click deposit address.
 *
 * The two signatures are not atomic. Once the withdraw lands, the USDC sits in
 * the user's wallet. A later failure is a `WithdrawPaymentError` carrying the
 * payment to finish — calling the withdraw again would pull a second time.
 * A payment that is still confirming (`TxPendingError`) is rethrown: retrying
 * it could pay the deposit address twice.
 */
export async function payOutboundFromSavings(input: OutboundPayInput, deps: OutboundPayDeps): Promise<{ hash: string }> {
  // Inbound never withdraws and never pays. Checked before any dependency so a
  // wrong direction cannot move funds.
  if (input.direction !== 'stellar_to_evm') {
    throw new Error('Inbound bridge does not withdraw from savings or pay out');
  }

  if (input.unpaid) {
    try {
      return await deps.sponsoredUsdcPayment({
        to: input.unpaid.address,
        amount: input.unpaid.amount,
        memo: input.memo,
      });
    } catch (error) {
      if (error instanceof TxPendingError) throw error;
      throw new WithdrawPaymentError(input.destinationLabel, error, input.unpaid);
    }
  }

  const balanceBefore = await deps.readUsdcBalance(input.walletAddress, input.decimals);
  const request = withdrawRequestAmount(input.amount, input.decimals, {
    hasPaymentLeg: !input.withdrawAll,
  });

  // A withdraw that throws never reached a payment. Rethrow it unchanged so the
  // screen can offer a real retry instead of a "finish the payment" path.
  const { hash } = await deps.passiveWithdraw({
    address: input.walletAddress,
    amount: request,
    decimals: input.decimals,
    withdrawAll: input.withdrawAll,
    flowKind: 'external_out',
  });

  // The position is already smaller. A refresh failure must not be reported as
  // a failed payment, and it must not start another withdraw.
  await deps.invalidateAfterWithdraw().catch(() => {});

  let toSend: string;
  try {
    const creditedBase = await deps.awaitUsdcCredit(input.walletAddress, input.decimals, balanceBefore, { hash });
    toSend = payableAmount(creditedBase, input.amount, input.decimals, { withdrawAll: input.withdrawAll });
  } catch (error) {
    throw new WithdrawPaymentError(input.destinationLabel, error, {
      address: input.depositAddress,
      // The credit could not be read, so the retry starts from the amount the
      // user asked to bridge. The payment itself re-reads nothing here.
      amount: input.amount,
      memo: input.rawMemo,
    });
  }

  // The quote can die while the withdraw confirms. Paying the old deposit
  // address after that sends funds 1Click will not attribute.
  if (deps.isQuoteExpired()) {
    throw new WithdrawPaymentError(input.destinationLabel, new Error('Bridge quote expired after the withdraw'), {
      address: input.depositAddress,
      amount: toSend,
      memo: input.rawMemo,
    });
  }

  try {
    return await deps.sponsoredUsdcPayment({
      to: input.depositAddress,
      amount: toSend,
      memo: input.memo,
    });
  } catch (error) {
    if (error instanceof TxPendingError) throw error;
    throw new WithdrawPaymentError(input.destinationLabel, error, {
      address: input.depositAddress,
      amount: toSend,
      memo: input.rawMemo,
    });
  }
}

import i18n from '@/core-ui/i18n';

/**
 * The payment that did not go through, with everything needed to send it on its
 * own. The address is here rather than only the label because what gets signed
 * is the address: the label can be a nickname that resolves elsewhere, or the
 * name the user saved a wallet under years ago.
 */
export interface PendingWithdrawPayment {
  /** Stellar address of the destination. */
  address: string;
  /** USDC sitting in the wallet for this payment, in human units. */
  amount: string;
  /** Memo the destination was saved with, `null` when it has none. */
  memo: string | null;
}

const FALLBACK =
  'Your money is out of savings and in your wallet, but the payment to {{destination}} did not go through. ' +
  'You can finish it from here.';

/**
 * A withdrawal to another user pulled the money out of savings but failed to pay
 * it out.
 *
 * The two legs are not atomic, and between them the money sits in the
 * withdrawer's own wallet. A generic error there ("we couldn't complete the
 * transaction") describes the state wrongly: it reads as nothing having moved
 * and the money still earning, when it has already left. This error says where
 * it ended up, and carries `payment` so the screen can offer to finish the
 * transfer instead of re-running a withdrawal that already happened.
 *
 * `cause` keeps the original payment error for logs and telemetry.
 */
export class WithdrawPaymentError extends Error {
  readonly i18nKey = 'txError.withdrawPaymentLeg';
  readonly fallback = FALLBACK;
  /** Label of the destination that was going to be paid (`@user` or the alias). */
  readonly destination: string;
  /** Original error text from the payment, for logs and "see details". */
  readonly raw: string;
  /** What it takes to send this payment again, without touching savings. */
  readonly payment: PendingWithdrawPayment;

  constructor(destination: string, cause: unknown, payment: PendingWithdrawPayment) {
    super(i18n.t('txError.withdrawPaymentLeg', FALLBACK, { destination }), { cause });
    this.name = 'WithdrawPaymentError';
    this.destination = destination;
    this.raw = cause instanceof Error ? cause.message : String(cause ?? '');
    this.payment = payment;
  }
}

/** True when the withdrawal failed AFTER the money left savings. */
export const isWithdrawPaymentError = (error: unknown): error is WithdrawPaymentError => error instanceof WithdrawPaymentError;

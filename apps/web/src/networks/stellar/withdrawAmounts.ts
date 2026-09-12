import { toBaseUnits } from './sorobanTx';
import { formatBaseUnits } from './vaultQueries';

/**
 * Extra USDC pulled out of savings by a withdrawal that still has a payment leg
 * ahead of it, so that leg can send the round figure the user approved.
 *
 * How much a withdrawal credits is decided by the vault's rounding as it
 * unwinds, once per strategy, not by the shares it is asked to burn: requesting
 * exactly 1 USDC can land at 0.9999999. Asking for this much more absorbs that
 * gap, and the destination receives the amount that was on the confirmation
 * screen rather than a figure ending in stray digits.
 *
 * The leftover is idle USDC like any other: it stays in the wallet, accumulates
 * with whatever else lands there, and goes back to work once it clears
 * `MIN_IDLE_USDC`.
 */
export const WITHDRAW_DUST_STR = '0.0001';

/**
 * USDC to ask the vault for.
 *
 * The margin is only worth paying for when a payment leg follows: a one-leg
 * withdrawal lands in the wallet the user already owns, where no exact figure
 * has to be met, and a full withdrawal takes the whole position through the
 * i128 sentinel and has nothing left to cover. Both backends clamp an
 * over-request at the position, so asking for more than there is cannot fail —
 * it just withdraws all of it.
 */
export const withdrawRequestAmount = (
  amount: string,
  decimals: number,
  { hasPaymentLeg }: { hasPaymentLeg: boolean },
): string =>
  hasPaymentLeg ? formatBaseUnits(toBaseUnits(amount, decimals) + toBaseUnits(WITHDRAW_DUST_STR, decimals), decimals) : amount;

/**
 * USDC the payment leg sends: the figure the user approved, floored at what the
 * withdrawal actually credited.
 *
 * It is a floor rather than the requested figure because the margin cannot be
 * guaranteed — a withdrawal that empties the position is clamped at the share
 * balance and credits less than it asked for, and paying the full figure there
 * bounces with `op_underfunded`, stranding the money in the wallet with the
 * withdrawal already settled. A full withdrawal sends the whole credit, which
 * carries interest the typed amount does not.
 */
export const payableAmount = (
  creditedBase: bigint,
  requested: string,
  decimals: number,
  { withdrawAll }: { withdrawAll: boolean },
): string => {
  const requestedBase = toBaseUnits(requested, decimals);
  return formatBaseUnits(withdrawAll || creditedBase < requestedBase ? creditedBase : requestedBase, decimals);
};

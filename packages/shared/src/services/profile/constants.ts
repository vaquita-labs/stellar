/**
 * `profiles_rewards.reason` value stamped on rewards granted by the daily
 * check-in. Lets check-in XP be summed and capped per day independently of any
 * other (future) XP source — see {@link getRewardsData}.
 */
export const REWARD_REASON_DAILY_CHECKIN = 'daily-checkin';

/**
 * `profiles_rewards.reason` value stamped on the NEGATIVE gold-coin rows that
 * pay for shop purchases (map items). The gold balance is the sum of the
 * ledger, so spending is just a negative entry — auditable per purchase.
 */
export const REWARD_REASON_SHOP_PURCHASE = 'shop-purchase';

/**
 * Beta Tester eligibility window. Profiles whose `created_at` is on or before
 * this date qualify for the Beta Tester badge. Hard-coded for v1 — when we
 * graduate the badge system to a generic eligibility table this constant
 * folds into the row's `criteria` JSON.
 */
export const BETA_TESTER_CUTOFF = new Date('2026-05-17T23:59:59Z');

/**
 * `profiles_rewards.reason` value stamped on the coins a deposit earns, in
 * either savings product.
 *
 * Its own reason rather than a shared one because the daily cap is summed by
 * reason: mixing these rows in with the check-in's would let one source eat the
 * other's allowance.
 */
export const REWARD_REASON_DEPOSIT = 'deposit';

/**
 * `profiles_rewards.reason` value stamped on rewards granted by the daily
 * check-in. Lets check-in XP be summed and capped per day independently of any
 * other (future) XP source — see {@link getRewardsData}.
 */
export const REWARD_REASON_DAILY_CHECKIN = 'daily-checkin';

/**
 * Beta Tester eligibility window. Profiles whose `created_at` is on or before
 * this date qualify for the Beta Tester badge. Hard-coded for v1 — when we
 * graduate the badge system to a generic eligibility table this constant
 * folds into the row's `criteria` JSON.
 */
export const BETA_TESTER_CUTOFF = new Date('2026-05-17T23:59:59Z');

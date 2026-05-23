export const DAILY_GOLD_COINS = 1;

/**
 * Beta Tester eligibility window. Profiles whose `created_at` is on or before
 * this date qualify for the Beta Tester badge. Hard-coded for v1 — when we
 * graduate the badge system to a generic eligibility table this constant
 * folds into the row's `criteria` JSON.
 */
export const BETA_TESTER_CUTOFF = new Date('2026-05-17T23:59:59Z');

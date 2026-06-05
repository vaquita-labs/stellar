-- Make the daily check-in reward amounts admin-configurable instead of
-- hard-coded in the app:
--
-- 1) `daily_gold_coins`        — gold coins granted per daily check-in
--    (replaces the hard-coded DAILY_GOLD_COINS = 1 constant).
-- 2) `daily_checkin_experience` — experience granted per daily check-in, persisted
--    to `profiles_rewards` (type 'earned', the `experience` reward) on collect and
--    summed into the profile's total experience.
--
-- Both live on the singleton `config` row and are edited from the admin Config
-- page. NOT NULL with sensible defaults so the existing row backfills cleanly.

ALTER TABLE config
  ADD COLUMN IF NOT EXISTS daily_gold_coins integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS daily_checkin_experience integer NOT NULL DEFAULT 0;
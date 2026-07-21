-- Two related cleanups around leaderboard cycles and timestamp naming:
--
-- 1) Move the leaderboard cycle duration out of the CYCLE_DURATION_MS env var and
--    into the singleton `config` row as `cycle_duration_ms` (milliseconds).
--    NULL = production calendar-month cycles; a positive value enables
--    fixed-duration test cycles. Editable from the admin Config page.
--
-- 2) Rename `badge_claims.expiry` -> `expires_at` to match the `*_at` convention
--    used by every other timestamptz column (created_at, updated_at, confirmed_at,
--    superseded_at, deleted_at). Values/units are unchanged.

ALTER TABLE config
  ADD COLUMN IF NOT EXISTS cycle_duration_ms integer;

ALTER TABLE badge_claims
  RENAME COLUMN expiry TO expires_at;

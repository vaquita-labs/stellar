-- Lock periods are stored as durations in milliseconds. Common periods (90d,
-- 180d, …) exceed the 32-bit `integer` max (2,147,483,647), so inserting them
-- into the `integer[]` column overflowed and the admin token-create endpoint
-- returned a 500. Widen the column to `bigint[]` to hold millisecond durations.
ALTER TABLE "tokens"
  ALTER COLUMN "lock_periods" TYPE bigint[] USING "lock_periods"::bigint[];
-- Store the accelerated game-clock day length in MILLISECONDS instead of
-- seconds, matching `cycle_duration_ms` and the unit every consumer already
-- works in (the web store keeps `dayLengthMs`, and GET /api/v1/time now serves
-- `dayLengthMs` directly).
--
-- Renames `game_day_length_seconds` → `game_day_length_ms` and scales the stored
-- value by 1000 so the existing row keeps its real-world duration. Idempotent:
-- the DO block only fires while the seconds column is still there, and the
-- ADD COLUMN covers a database that never had it.
--
-- int4 tops out at ~2.1e9 ms (~24.8 days), far beyond any usable day length.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'config' AND column_name = 'game_day_length_seconds'
  ) THEN
    ALTER TABLE config RENAME COLUMN game_day_length_seconds TO game_day_length_ms;
    UPDATE config SET game_day_length_ms = game_day_length_ms * 1000;
    ALTER TABLE config ALTER COLUMN game_day_length_ms SET DEFAULT 1200000;
  END IF;
END $$;

ALTER TABLE config
  ADD COLUMN IF NOT EXISTS game_day_length_ms integer NOT NULL DEFAULT 1200000;

-- Make the accelerated game-clock day length admin-configurable instead of an
-- env var:
--
-- `game_day_length_seconds` — real seconds per FULL in-game day. The game clock
-- runs accelerated (Minecraft-style) and is global for every player: the API
-- serves this value to all clients via GET /api/v1/time, and the day progress is
-- derived deterministically from absolute time, so everyone shares the same
-- in-game hour and day/night cycle. Replaces the (removed) GAME_DAY_LENGTH_SECONDS
-- env var.
--
-- Lives on the singleton `config` row and is edited from the admin Config page.
-- NOT NULL with a sensible default (1200s = 20 min) so the existing row backfills
-- cleanly.

ALTER TABLE config
  ADD COLUMN IF NOT EXISTS game_day_length_seconds integer NOT NULL DEFAULT 1200;

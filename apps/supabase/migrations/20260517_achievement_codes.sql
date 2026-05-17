-- =============================================================================
-- Redeem-code achievements.
--
-- Adds two columns to `achievements`:
--   * `code`   — single-use-per-user redemption code (UNIQUE across catalog).
--                NULL for regular achievements (eligibility-driven). When set,
--                the user can claim the badge by entering this code in the
--                "Redeem code" modal on the achievements page.
--   * `hidden` — when TRUE, the achievement is not listed in
--                `toProfileAchievementsResponseDTO` until the user has actually
--                claimed it. Pair with `code` to ship truly secret badges that
--                only show up after redemption.
--
-- Idempotent: re-running this file is safe (ADD COLUMN IF NOT EXISTS, ON
-- CONFLICT updates for the seed). Single-claim semantics still come from the
-- UNIQUE constraint on (profile_id, achievement_id) added in 20260516.
-- =============================================================================

BEGIN;

ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS code   TEXT,
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- UNIQUE only over non-null codes — most rows have `code = NULL` and Postgres
-- treats those as distinct under a normal UNIQUE, but a partial index is the
-- idiomatic way to be explicit about it (and to allow future re-issues with
-- `code = NULL`).
CREATE UNIQUE INDEX IF NOT EXISTS achievements_code_unique
  ON achievements (code) WHERE code IS NOT NULL;

-- Seed: one hidden launch badge to validate the flow end-to-end. Replace the
-- code with whatever you want to hand out at the event. Idempotent — running
-- this twice updates copy + keeps the same row.
INSERT INTO achievements (key, name, description, tier, coin_reward, code, hidden)
VALUES (
  'secret-launch',
  'Launch Insider',
  'You were there when Vaquita went live. A secret welcome from the herd.',
  'Founder',
  500,
  'VAQUITA-LAUNCH-2026',
  TRUE
)
ON CONFLICT (key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      tier        = EXCLUDED.tier,
      coin_reward = EXCLUDED.coin_reward,
      code        = EXCLUDED.code,
      hidden      = EXCLUDED.hidden,
      updated_at  = NOW();

COMMIT;

-- =============================================================================
-- Manual verification:
--
--   -- Confirm columns exist:
--   \d achievements
--
--   -- Confirm secret row is there:
--   SELECT key, code, hidden FROM achievements WHERE hidden = TRUE;
--
--   -- Try redeeming as profile 1 (replace id):
--   SELECT * FROM claim_achievement(1, 'secret-launch');
--
--   -- Verify coin credit:
--   SELECT amount, type, created_at FROM profiles_rewards
--     WHERE profile_id = 1 ORDER BY created_at DESC LIMIT 3;
-- =============================================================================

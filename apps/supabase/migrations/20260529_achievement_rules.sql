-- =============================================================================
-- Configurable badge catalog + rules engine.
--
-- Turns `achievements` into the single source of truth the admin panel edits,
-- so adding/disabling badges and changing copy/icons/thresholds needs no
-- frontend redeploy. Adds:
--
--   * `unlock_type`   — how the badge unlocks:
--       'rule'        — evaluated by the generic rules engine against the live
--                       signals in computeEligibilitySignals (XP, streak, …).
--       'redeem_code' — claimed via the "Redeem code" flow (pairs with `code`).
--       'manual'      — admin-granted only.
--       'cycle_rank'  — leaderboard badges; rank against the last closed cycle
--                       (kept as special-cased logic, NOT a generic rule).
--   * `rule`          — JSONB rule definition, only for unlock_type = 'rule'.
--                       Shape: { "all": [ { "signal", "op", "value" }, ... ] }.
--                       Numeric ops: >=, >, <=, <, ==. Date ops: before, after.
--   * `icon`          — public icon path (or absolute URL). Mirrors the frontend
--                       catalog so the web app can read it from the backend.
--   * `accent`        — CSS gradient used as the halo behind the icon.
--   * `display_order` — ascending sort order in the catalog UI.
--   * `enabled`       — soft-delete flag. Disabled badges are hidden from the
--                       public catalog but their historical claims survive. We
--                       never DELETE rows.
--
-- The `rule` backfill reproduces the hardcoded isEligibleForAchievement switch
-- (packages/shared/src/services/profile/index.ts) 1:1, so flipping the API over
-- to the evaluator is behaviour-preserving.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + keyed UPDATEs. Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS unlock_type   TEXT    NOT NULL DEFAULT 'rule'
    CHECK (unlock_type IN ('rule', 'redeem_code', 'manual', 'cycle_rank')),
  ADD COLUMN IF NOT EXISTS rule          JSONB,
  ADD COLUMN IF NOT EXISTS icon          TEXT,
  ADD COLUMN IF NOT EXISTS accent        TEXT,
  ADD COLUMN IF NOT EXISTS display_order INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enabled       BOOLEAN NOT NULL DEFAULT TRUE;

-- -----------------------------------------------------------------------------
-- Classify unlock_type. Order matters: start from the 'rule' default (set by
-- ADD COLUMN above), then carve out the non-rule kinds.
-- -----------------------------------------------------------------------------

-- Leaderboard badges → rank-based, cycle-scoped.
UPDATE achievements SET unlock_type = 'cycle_rank'
  WHERE cycle_scoped = TRUE;

-- Code-gated badges → redeemable.
UPDATE achievements SET unlock_type = 'redeem_code'
  WHERE code IS NOT NULL;

-- Manual-only badges that aren't code-gated (limited-edition drops).
UPDATE achievements SET unlock_type = 'manual'
  WHERE refresh_policy = 'manual' AND code IS NULL AND cycle_scoped = FALSE;

-- -----------------------------------------------------------------------------
-- Backfill rule JSON for the eligibility-driven badges (mirrors the switch).
-- -----------------------------------------------------------------------------
UPDATE achievements SET rule = '{"all":[{"signal":"createdAt","op":"before","value":"2026-05-17T23:59:59Z"}]}'::jsonb WHERE key = 'beta-tester';
UPDATE achievements SET rule = '{"all":[{"signal":"experience","op":">=","value":50}]}'::jsonb        WHERE key = 'rookie';
UPDATE achievements SET rule = '{"all":[{"signal":"streakCount","op":">=","value":7}]}'::jsonb        WHERE key = 'week-warrior';
UPDATE achievements SET rule = '{"all":[{"signal":"activeDeposits","op":">=","value":1}]}'::jsonb     WHERE key = 'first-deposit';
UPDATE achievements SET rule = '{"all":[{"signal":"friendsCount","op":">=","value":1}]}'::jsonb       WHERE key = 'first-friend';
UPDATE achievements SET rule = '{"all":[{"signal":"activeAmount","op":">=","value":100}]}'::jsonb     WHERE key = 'savings-starter';
UPDATE achievements SET rule = '{"all":[{"signal":"activeDeposits","op":">=","value":3}]}'::jsonb     WHERE key = 'trio-saver';
UPDATE achievements SET rule = '{"all":[{"signal":"streakCount","op":">=","value":30}]}'::jsonb       WHERE key = 'month-master';
UPDATE achievements SET rule = '{"all":[{"signal":"experience","op":">=","value":300}]}'::jsonb       WHERE key = 'explorer';
UPDATE achievements SET rule = '{"all":[{"signal":"streakCount","op":">=","value":50}]}'::jsonb       WHERE key = 'streak-master';
UPDATE achievements SET rule = '{"all":[{"signal":"experience","op":">=","value":30000}]}'::jsonb     WHERE key = 'whale';
UPDATE achievements SET rule = '{"all":[{"signal":"activeAmount","op":">=","value":10000}]}'::jsonb   WHERE key = 'savings-baron';
UPDATE achievements SET rule = '{"all":[{"signal":"streakCount","op":">=","value":100}]}'::jsonb      WHERE key = 'century-saver';

-- Non-rule badges keep rule = NULL.
UPDATE achievements SET rule = NULL WHERE unlock_type <> 'rule';

-- -----------------------------------------------------------------------------
-- Backfill icon / accent / display_order from the frontend catalog
-- (apps/web/src/core-ui/data/achievement-catalog.ts) so the web app can stop
-- hardcoding them and read everything from here.
-- -----------------------------------------------------------------------------
UPDATE achievements SET icon = '/icons/achievements/beta-tester2.png',   accent = 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)', display_order = 1  WHERE key = 'beta-tester';
UPDATE achievements SET icon = '/icons/achievements/rookie.png',         accent = 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)', display_order = 2  WHERE key = 'rookie';
UPDATE achievements SET icon = '/icons/achievements/week-warrior.png',   accent = 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)', display_order = 3  WHERE key = 'week-warrior';
UPDATE achievements SET icon = '/icons/achievements/first-deposit.png',  accent = 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)', display_order = 4  WHERE key = 'first-deposit';
UPDATE achievements SET icon = '/icons/achievements/first-friend.png',   accent = 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)', display_order = 5  WHERE key = 'first-friend';
UPDATE achievements SET icon = '/icons/achievements/savings-starter.png',accent = 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)', display_order = 6  WHERE key = 'savings-starter';
UPDATE achievements SET icon = '/icons/achievements/trio-saver.png',     accent = 'linear-gradient(180deg, #B89AFF 0%, #7C4DFF 100%)', display_order = 7  WHERE key = 'trio-saver';
UPDATE achievements SET icon = '/icons/achievements/month-master.png',   accent = 'linear-gradient(180deg, #FF8A65 0%, #E64A19 100%)', display_order = 8  WHERE key = 'month-master';
UPDATE achievements SET icon = '/icons/achievements/explorer.png',       accent = 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)', display_order = 9  WHERE key = 'explorer';
UPDATE achievements SET icon = '/icons/achievements/streak-master.png',  accent = 'linear-gradient(180deg, #FFB347 0%, #FF7A00 100%)', display_order = 10 WHERE key = 'streak-master';
UPDATE achievements SET icon = '/icons/achievements/whale.png',          accent = 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)', display_order = 11 WHERE key = 'whale';
UPDATE achievements SET icon = '/icons/achievements/savings-baron.png',  accent = 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)', display_order = 12 WHERE key = 'savings-baron';
UPDATE achievements SET icon = '/icons/achievements/century-saver.png',  accent = 'linear-gradient(180deg, #FFD180 0%, #FF6F00 100%)', display_order = 13 WHERE key = 'century-saver';
UPDATE achievements SET icon = '/icons/achievements/third-place.png',    accent = 'linear-gradient(180deg, #FFCC80 0%, #A05A2C 100%)', display_order = 14 WHERE key = 'third-place';
UPDATE achievements SET icon = '/icons/achievements/second-place.png',   accent = 'linear-gradient(180deg, #E0E0E0 0%, #9E9E9E 100%)', display_order = 15 WHERE key = 'second-place';
UPDATE achievements SET icon = '/icons/achievements/first-place.png',    accent = 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)', display_order = 16 WHERE key = 'first-place';

-- Catalog is ordered by display_order; index it.
CREATE INDEX IF NOT EXISTS achievements_display_order_idx
  ON achievements (display_order);

COMMIT;

-- =============================================================================
-- Manual verification:
--
--   -- Every badge classified, rule present only for 'rule' types:
--   SELECT key, unlock_type, enabled, display_order, rule
--     FROM achievements ORDER BY display_order;
--
--   -- 13 rule badges, 3 cycle_rank, plus redeem_code/manual for any seeds:
--   SELECT unlock_type, COUNT(*) FROM achievements GROUP BY unlock_type;
--
--   -- No 'rule' badge left without a rule:
--   SELECT key FROM achievements WHERE unlock_type = 'rule' AND rule IS NULL;
-- =============================================================================

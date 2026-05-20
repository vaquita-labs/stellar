-- =============================================================================
-- Add refresh_policy + cycle_scoped to achievements.
--
-- refresh_policy:
--   'auto'   — signed on demand; eligibility re-verified at request time
--              (personal milestones, leaderboard badges).
--   'manual' — no automatic re-sign; admin must issue the claim
--              (limited-edition drops, redeem-code badges).
--
-- cycle_scoped:
--   FALSE — badge is not tied to a specific cycle (milestones, manual).
--   TRUE  — eligibility is rank-based and tied to the last closed cycle
--            (leaderboard badges).
-- =============================================================================

BEGIN;

ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS refresh_policy text NOT NULL DEFAULT 'auto'
    CHECK (refresh_policy IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS cycle_scoped boolean NOT NULL DEFAULT FALSE;

-- Personal milestones — on-demand, no cycle
UPDATE achievements SET refresh_policy = 'auto', cycle_scoped = FALSE
  WHERE key IN (
    'beta-tester', 'rookie', 'week-warrior', 'first-deposit', 'first-friend',
    'savings-starter', 'trio-saver', 'month-master', 'explorer',
    'streak-master', 'whale', 'savings-baron', 'century-saver'
  );

-- Leaderboard badges — on-demand signing, eligibility is rank-based + cycle-scoped
UPDATE achievements SET refresh_policy = 'auto', cycle_scoped = TRUE
  WHERE key IN ('first-place', 'second-place', 'third-place');

-- Redeem-code / limited-edition — manual only
UPDATE achievements SET refresh_policy = 'manual', cycle_scoped = FALSE
  WHERE key IN ('churrasquito-05-2026', 'secret-launch');

COMMIT;

-- =============================================================================
-- Manual verification:
--
--   -- All rows should have non-null refresh_policy and cycle_scoped:
--   SELECT key, refresh_policy, cycle_scoped FROM achievements ORDER BY key;
--
--   -- Exactly 3 cycle_scoped = TRUE rows (leaderboard badges):
--   SELECT COUNT(*) FROM achievements WHERE cycle_scoped = TRUE;
--
--   -- Exactly 2 manual rows:
--   SELECT key FROM achievements WHERE refresh_policy = 'manual';
-- =============================================================================

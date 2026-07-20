-- profiles_achievements_unlocks: permanent "this profile once met the rule" latch.
--
-- Rule badges are evaluated against *live* signals (XP, streak, active deposits,
-- friends). Every one of those signals can go down — withdraw a deposit, miss a
-- day, unfollow someone — which silently re-locked a badge the user had already
-- been shown as earned. A badge must never be un-earned.
--
-- This table records the moment a profile first satisfied a badge's rule. From
-- then on eligibility reads `liveRule(signals) OR latched`, so the live rule can
-- only ever *open* the latch, never close it. Distinct from
-- `profiles_achievements`, which records the stronger event of actually claiming
-- (and being paid for) the badge.

CREATE TABLE IF NOT EXISTS profiles_achievements_unlocks (
  id             BIGSERIAL   PRIMARY KEY,
  profile_id     INTEGER     NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id BIGINT      NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_achievements_unlocks_unique UNIQUE (profile_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS profiles_achievements_unlocks_profile_idx
  ON profiles_achievements_unlocks(profile_id);

-- Backfill: anyone who already claimed a badge, or who holds a badge voucher
-- (issued only after an eligibility check passed), was demonstrably eligible at
-- some point. Latch them so the new rule never strips what they already earned.
INSERT INTO profiles_achievements_unlocks (profile_id, achievement_id, unlocked_at)
SELECT pa.profile_id, pa.achievement_id, pa.claimed_at
FROM profiles_achievements pa
ON CONFLICT (profile_id, achievement_id) DO NOTHING;

INSERT INTO profiles_achievements_unlocks (profile_id, achievement_id, unlocked_at)
SELECT DISTINCT ON (p.id, a.id) p.id, a.id, bc.created_at
FROM badge_claims bc
JOIN profiles p ON p.wallet_address = bc.wallet_address
JOIN achievements a ON a.key = bc.badge_type
WHERE bc.deleted_at IS NULL
  AND a.unlock_type = 'rule'
ORDER BY p.id, a.id, bc.created_at
ON CONFLICT (profile_id, achievement_id) DO NOTHING;

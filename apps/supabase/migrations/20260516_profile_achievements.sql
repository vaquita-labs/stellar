-- =============================================================================
-- Achievements / badges system.
--
--   - `achievements`              catalog of all badges (id, key, copy, tier, coin reward)
--   - `profiles_achievements`     ledger of (profile, achievement, claimed_at)
--   - `claim_achievement(...)`    PL/pgSQL helper that atomically inserts the
--                                 ledger row + a `profiles_rewards` 'earned'
--                                 row of `coin_reward` gold coins. The UNIQUE
--                                 constraint on (profile_id, achievement_id)
--                                 surfaces double-claim as Postgres error 23505,
--                                 which the API turns into a 409.
--
-- The catalog mirrors `apps/web/src/core-ui/data/achievement-catalog.ts` (16
-- keys, frontend is the source of truth for copy/icons). The migration re-runs
-- the INSERT with ON CONFLICT UPDATE so changing copy on the frontend can be
-- propagated by simply re-applying this file.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS achievements (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  tier        TEXT NOT NULL,
  coin_reward INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles_achievements (
  id             BIGSERIAL PRIMARY KEY,
  profile_id     BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id BIGINT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  claimed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS profiles_achievements_profile_idx
  ON profiles_achievements (profile_id);

-- Catalog seed. Tier values mirror `CatalogAchievement.tier`. Coin reward per
-- tier mirrors `TIER_REWARD` in AchievementModal.tsx:
--   Bronze 25 / Silver 50 / Gold 100 / Diamond 250 / Founder 500.
INSERT INTO achievements (key, name, description, tier, coin_reward) VALUES
  ('beta-tester',     'Beta Tester',     'You joined Vaquita during the beta. Thanks for helping us shape it.', 'Founder', 500),
  ('rookie',          'Rookie',          'Earn your first 50 XP. Welcome to the herd.',                          'Bronze',   25),
  ('week-warrior',    'Week Warrior',    'Reach a 7-day savings streak.',                                        'Bronze',   25),
  ('first-deposit',   'First Deposit',   'Made your very first deposit in Vaquita.',                             'Bronze',   25),
  ('first-friend',    'Crew Mate',       'Follow your first fellow vaquero.',                                    'Bronze',   25),
  ('savings-starter', 'Savings Starter', 'Reach $100 USDC in cumulative deposits.',                              'Silver',   50),
  ('trio-saver',      'Triple Threat',   'Keep 3 active deposits running at the same time.',                     'Silver',   50),
  ('month-master',    'Month Master',    'Reach a 30-day savings streak.',                                       'Silver',   50),
  ('explorer',        'Explorer',        'Earn 300 XP across all challenges.',                                   'Silver',   50),
  ('streak-master',   'Streak Master',   'Reach a 50-day savings streak.',                                       'Gold',    100),
  ('whale',           'Vaquita Whale',   'Reach 30,000 XP. Now THAT is dedication.',                             'Gold',    100),
  ('savings-baron',   'Savings Baron',   'Reach $10,000 USDC in cumulative deposits.',                           'Gold',    100),
  ('century-saver',   'Century Saver',   'Reach a 100-day savings streak. Legendary.',                           'Diamond', 250),
  ('third-place',     'Bronze Medalist', 'Finish #3 on the monthly leaderboard.',                                'Bronze',   25),
  ('second-place',    'Silver Medalist', 'Finish #2 on the monthly leaderboard.',                                'Silver',   50),
  ('first-place',     'Gold Medalist',   'Finish #1 on the monthly leaderboard.',                                'Gold',    100)
ON CONFLICT (key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      tier        = EXCLUDED.tier,
      coin_reward = EXCLUDED.coin_reward,
      updated_at  = NOW();

-- Atomic claim: write the ledger row + the gold-coin reward in a single
-- transaction so a partial failure can't leave a user with a claimed badge
-- but no coins (or vice versa). The function relies on the UNIQUE constraint
-- on (profile_id, achievement_id) to enforce single-claim semantics — a
-- repeat call raises Postgres error 23505 which the API translates to 409.
CREATE OR REPLACE FUNCTION claim_achievement(
  p_profile_id      BIGINT,
  p_achievement_key TEXT
) RETURNS TABLE (
  achievement_id BIGINT,
  coin_reward    INT,
  claimed_at     TIMESTAMPTZ
) AS $$
DECLARE
  v_id          BIGINT;
  v_coin_reward INT;
  v_gold_id     BIGINT;
  v_now         TIMESTAMPTZ := NOW();
BEGIN
  SELECT id, achievements.coin_reward
    INTO v_id, v_coin_reward
    FROM achievements
    WHERE key = p_achievement_key;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Unknown achievement key: %', p_achievement_key
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id INTO v_gold_id FROM rewards WHERE key = 'gold-coin';
  IF v_gold_id IS NULL THEN
    RAISE EXCEPTION 'gold-coin reward row is missing from `rewards`.';
  END IF;

  INSERT INTO profiles_achievements (profile_id, achievement_id, claimed_at)
    VALUES (p_profile_id, v_id, v_now);

  IF v_coin_reward > 0 THEN
    INSERT INTO profiles_rewards (profile_id, reward_id, type, amount, created_at, updated_at)
      VALUES (p_profile_id, v_gold_id, 'earned', v_coin_reward, v_now, v_now);
  END IF;

  achievement_id := v_id;
  coin_reward    := v_coin_reward;
  claimed_at     := v_now;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- =============================================================================
-- Manual verification queries (run after committing):
--
--   -- Catalog count should be 16:
--   SELECT COUNT(*) FROM achievements;
--
--   -- Claim once (replace 1 with a real profile id) — should return one row:
--   SELECT * FROM claim_achievement(1, 'beta-tester');
--
--   -- Claim again — should raise unique_violation (SQLSTATE 23505):
--   SELECT * FROM claim_achievement(1, 'beta-tester');
--
--   -- Confirm the coin credit landed:
--   SELECT amount, type, created_at FROM profiles_rewards
--     WHERE profile_id = 1 AND type = 'earned'
--     ORDER BY created_at DESC LIMIT 5;
-- =============================================================================
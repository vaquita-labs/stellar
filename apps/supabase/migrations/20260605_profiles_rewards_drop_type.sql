-- Unify the reward ledger on a single discriminator: `reason` (the source/event)
-- replaces `type` ('collected'/'earned'). `reward_id` already tells coins from XP;
-- `reason` tells daily check-in from achievements/etc. `type` was derivable from
-- (reward_id, reason), so it's dropped.
--
-- Steps (atomic):
--   1. Backfill `reason` from the old `type`:
--        - every 'collected' row was a daily check-in coin  -> 'daily-checkin'
--        - every remaining 'earned' row is achievement gold  -> 'achievement'
--          (the only earned-gold path is claim_achievement; check-in XP rows
--           already carry reason 'daily-checkin')
--   2. Make `reason` NOT NULL — it's now the required source of every reward.
--   3. Redefine claim_achievement() to stamp reason='achievement' instead of
--      writing the (about-to-be-dropped) `type` column.
--   4. Drop the `type` column.

BEGIN;

-- 1. Backfill ------------------------------------------------------------------
UPDATE profiles_rewards SET reason = 'daily-checkin'
  WHERE reason IS NULL AND type = 'collected';

UPDATE profiles_rewards SET reason = 'achievement'
  WHERE reason IS NULL AND type = 'earned';

-- Safety net for any unforeseen row so the NOT NULL below can't fail.
UPDATE profiles_rewards SET reason = 'unknown'
  WHERE reason IS NULL;

-- 2. Require a source on every reward ------------------------------------------
ALTER TABLE profiles_rewards ALTER COLUMN reason SET NOT NULL;

-- 3. Redefine the achievement claim to use `reason` instead of `type` ----------
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
    INSERT INTO profiles_rewards (profile_id, reward_id, reason, amount, created_at, updated_at)
      VALUES (p_profile_id, v_gold_id, 'achievement', v_coin_reward, v_now, v_now);
  END IF;

  achievement_id := v_id;
  coin_reward    := v_coin_reward;
  claimed_at     := v_now;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- 4. Drop the now-redundant column ---------------------------------------------
ALTER TABLE profiles_rewards DROP COLUMN type;

COMMIT;

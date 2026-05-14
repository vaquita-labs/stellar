-- =============================================================================
-- Currency refactor: collapse the two-coin economy (silver + gold) into a
-- single gold-coin currency.
--
-- Strategy:
--   1. For every profile that ever earned/collected silver, sum its silver
--      amount across both 'collected' and 'earned' rows, convert that total
--      into gold using `ceil(silver / 100)`, and credit it to the user via a
--      single 'earned' row of type gold-coin (audit trail: silver-to-gold
--      conversion).
--   2. Delete every profiles_rewards row pointing at the silver-coin reward.
--   3. Delete the silver-coin row from the rewards catalogue.
--
-- Run this AFTER the app has been deployed with gold-only support, so that
-- the moment silver rows disappear no client code is reading them anymore.
-- The whole thing runs in a single transaction; any error rolls everything
-- back so we don't end up with half-converted balances.
-- =============================================================================

BEGIN;

-- Guard: make sure the silver-coin reward still exists. If it doesn't, this
-- migration has either already been run or the schema is in an unexpected
-- state — bail out instead of silently doing nothing.
DO $$
DECLARE
  silver_id BIGINT;
  gold_id   BIGINT;
BEGIN
  SELECT id INTO silver_id FROM rewards WHERE key = 'silver-coin';
  SELECT id INTO gold_id   FROM rewards WHERE key = 'gold-coin';

  IF silver_id IS NULL THEN
    RAISE NOTICE 'No silver-coin reward found; migration is a no-op.';
    RETURN;
  END IF;

  IF gold_id IS NULL THEN
    RAISE EXCEPTION 'Cannot migrate: gold-coin reward row is missing from `rewards`.';
  END IF;

  -- 1. Convert per-profile silver totals into a single gold credit row.
  INSERT INTO profiles_rewards (profile_id, reward_id, type, amount, created_at, updated_at)
  SELECT
    pr.profile_id,
    gold_id,
    'earned',
    CEIL(SUM(pr.amount) / 100.0)::numeric,
    NOW(),
    NOW()
  FROM profiles_rewards pr
  WHERE pr.reward_id = silver_id
    AND pr.type IN ('collected', 'earned')
  GROUP BY pr.profile_id
  HAVING CEIL(SUM(pr.amount) / 100.0) > 0;

  -- 2. Delete all silver rows for every profile (collected, earned, anything else).
  DELETE FROM profiles_rewards WHERE reward_id = silver_id;

  -- 3. Drop the silver-coin row from the catalogue.
  DELETE FROM rewards WHERE id = silver_id;
END $$;

COMMIT;

-- =============================================================================
-- Verification queries (run manually after committing):
--
--   -- Should return 0:
--   SELECT COUNT(*) FROM rewards WHERE key = 'silver-coin';
--
--   -- Should return 0:
--   SELECT COUNT(*) FROM profiles_rewards pr
--     JOIN rewards r ON r.id = pr.reward_id
--     WHERE r.key = 'silver-coin';
--
--   -- Spot-check converted balances:
--   SELECT profile_id, SUM(amount) AS gold_total
--     FROM profiles_rewards pr
--     JOIN rewards r ON r.id = pr.reward_id
--     WHERE r.key = 'gold-coin'
--     GROUP BY profile_id
--     ORDER BY gold_total DESC
--     LIMIT 20;
-- =============================================================================

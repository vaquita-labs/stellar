-- Achievement behaviour is dispatched on unlock_type. A typo'd value does not
-- error anywhere — the badge just becomes permanently unclaimable, which
-- surfaces weeks later as "that badge never appears".
--
-- Lives here rather than only in apps/supabase/migrations because Prisma cannot
-- express a CHECK, so `prisma db push` drops it during reconciliation; this
-- directory re-runs after every push and puts it back.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'achievements_unlock_type_check'
  ) THEN
    ALTER TABLE "achievements"
      ADD CONSTRAINT "achievements_unlock_type_check"
      CHECK (unlock_type = ANY (ARRAY['rule', 'redeem_code', 'manual', 'cycle_rank']));
  END IF;
END $$;

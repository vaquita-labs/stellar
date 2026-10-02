-- deposit_intents.status is a closed set.
--
-- Lives here rather than only in apps/supabase/migrations because Prisma cannot
-- express a CHECK, so `prisma db push` drops it during reconciliation; this
-- directory re-runs after every push and puts it back.
DO $$
BEGIN
  -- The home card shows 'open' rows and nothing else. A typo'd status would
  -- neither show nor count as closed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deposit_intents_status_check'
  ) THEN
    ALTER TABLE "deposit_intents"
      ADD CONSTRAINT "deposit_intents_status_check"
      CHECK (status = ANY (ARRAY['open', 'arrived', 'cancelled', 'expired']));
  END IF;
END $$;

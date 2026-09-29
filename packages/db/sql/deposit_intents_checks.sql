-- deposit_intents: the status set and the one-open-row-per-profile rule.
--
-- Lives here rather than only in apps/supabase/migrations because Prisma cannot
-- express a CHECK or a partial unique index, so `prisma db push` drops both
-- during reconciliation; this directory re-runs after every push and puts them
-- back.
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

-- One waiting card per user. Opening a new intent closes the previous one in
-- the same transaction (see services/depositIntents), and this is the backstop
-- for two tabs racing each other.
CREATE UNIQUE INDEX IF NOT EXISTS "deposit_intents_one_open_per_profile"
  ON "deposit_intents" ("profile_id")
  WHERE "status" = 'open';

-- `nickname` is a public URL segment (/leaderboard/<nickname>, /explore/<nickname>)
-- and the key a shareable card resolves a claim by, so its character set is a
-- correctness concern, not a style one. NULL stays legal for profiles that have
-- not chosen a nickname yet.
--
-- Lives here rather than only in apps/supabase/migrations because Prisma cannot
-- express a CHECK, so `prisma db push` drops it during reconciliation; this
-- directory re-runs after every push and puts it back.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_nickname_format'
  ) THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_nickname_format"
      CHECK (nickname IS NULL OR nickname ~ '^[a-z0-9_]{3,32}$');
  END IF;
END $$;

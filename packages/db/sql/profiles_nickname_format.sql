-- `nickname` is a public URL segment (/leaderboard/<nickname>, /explore/<nickname>),
-- the key a shareable card resolves a claim by, and — since 20260911_vaquitatag —
-- the invite code itself, so its character set is a correctness concern, not a
-- style one. NULL stays legal for profiles that have not chosen one yet.
--
-- No underscore: the tag gets read out loud and typed at an event. The 32 here
-- is the STORABLE bound and only exists for the names that predate the rule;
-- new ones are capped at 15 by apps/api/src/lib/nicknamePolicy.ts, which is the
-- only place that bound can live because the database cannot tell an old row
-- from a new write.
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
      CHECK (nickname IS NULL OR nickname ~ '^[a-z0-9]{3,32}$');
  END IF;
END $$;

-- Integrity objects that only ever got applied to development.
--
-- These three were created by hand against dev and never written down, so they
-- are missing from staging AND production. Prisma cannot express any of them
-- (CHECK constraints and a plain unique index on non-@unique columns), which is
-- why `prisma db push` never reproduced them — and why a future push will DROP
-- them again unless they also live in packages/db/sql/, which re-runs after every
-- push. This file is the record; the sql/ copies are the durability.
--
-- Verified against staging and production before writing: zero violating rows in
-- either (apps/api/tmp/2026-08-25-staging-constraint-precheck.ts). Re-run that
-- check before applying to any environment — a CHECK or UNIQUE that existing
-- rows violate fails at CREATE time and aborts the whole file.
--
-- Idempotent throughout.

-- Achievement behaviour is dispatched on unlock_type. A typo'd value does not
-- error anywhere; it just makes the badge permanently unclaimable, which is the
-- kind of bug that shows up as "the badge never appears" weeks later.
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

-- `nickname` is a public URL segment (/leaderboard/<nickname>, /explore/<nickname>)
-- and the key a shareable card resolves a claim by. The UNIQUE index already
-- exists everywhere; this is the format half — lowercase, no path-breaking or
-- homoglyph characters. NULL stays legal for profiles that have not chosen one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_nickname_format'
  ) THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_nickname_format"
      -- Sin guion bajo desde 20260911_vaquitatag: el nickname ES el código de
      -- invitación y se dicta en voz alta. Si esa migración ya corrió acá, este
      -- bloque no hace nada (el constraint existe); si esta corre primero, deja
      -- puesta la regla nueva y la otra la vuelve a poner igual.
      CHECK (nickname IS NULL OR nickname ~ '^[a-z0-9]{3,32}$');
  END IF;
END $$;

-- map_objects is a catalog, keyed in practice by (type, variants). A duplicate
-- pair means the shop renders the same item twice and the seed script silently
-- inserts instead of updating.
CREATE UNIQUE INDEX IF NOT EXISTS map_objects_type_variants_uq
  ON "map_objects" ("type", "variants");

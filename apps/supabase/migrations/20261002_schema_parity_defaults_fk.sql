-- Brings a database back in line with DDL that earlier migrations declare but
-- that is missing on some environments. Both statements are no-ops where the
-- object is already there.

-- 20260731_wallet_balances.sql creates `updated_at` with DEFAULT now().
ALTER TABLE "wallet_balances" ALTER COLUMN "updated_at" SET DEFAULT now();

-- 20260910_pwa_installs.sql declares the reference inline. Where the table was
-- created without it, an install row can outlive its profile.
--
-- If this fails with a foreign key violation, the table already holds rows
-- whose profile is gone. Look at them before deciding what to do:
--   SELECT i.* FROM pwa_installs i LEFT JOIN profiles p ON p.id = i.profile_id WHERE p.id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pwa_installs_profile_id_fkey'
  ) THEN
    ALTER TABLE "pwa_installs"
      ADD CONSTRAINT "pwa_installs_profile_id_fkey"
      FOREIGN KEY ("profile_id") REFERENCES "profiles" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

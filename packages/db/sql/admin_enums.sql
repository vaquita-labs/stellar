-- admin_users.role is a closed set, and admin_users.email must be lower-cased
-- (the app lower-cases before every lookup, so a mixed-case row would be a
-- person nobody can match). A typo'd role would not error anywhere: the person
-- would just silently be read-only, or silently not.
--
-- Lives here because Prisma cannot express a CHECK, so `prisma db push` drops
-- it during reconciliation; this directory re-runs after every push.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_role_check'
  ) THEN
    ALTER TABLE "admin_users"
      ADD CONSTRAINT "admin_users_role_check"
      CHECK (role = ANY (ARRAY['operator', 'read-only']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_email_lower_check'
  ) THEN
    ALTER TABLE "admin_users"
      ADD CONSTRAINT "admin_users_email_lower_check"
      CHECK (email = lower(email));
  END IF;
END $$;

-- pwa_installs.platform is a closed set. A typo'd value does not error
-- anywhere — the row just stops matching the dashboard's platform breakdown,
-- so an install silently lands in a bucket nobody looks at.
--
-- Lives here rather than only in apps/supabase/migrations because Prisma cannot
-- express a CHECK, so `prisma db push` drops it during reconciliation; this
-- directory re-runs after every push and puts it back.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pwa_installs_platform_check'
  ) THEN
    ALTER TABLE "pwa_installs"
      ADD CONSTRAINT "pwa_installs_platform_check"
      CHECK (platform = ANY (ARRAY['android', 'ios', 'desktop', 'other']));
  END IF;
END $$;

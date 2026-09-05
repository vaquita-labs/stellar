-- feedback_posts.kind and .status are closed sets. A typo'd value does not
-- error anywhere — the row just stops matching the admin inbox filters and the
-- report silently disappears from triage.
--
-- Lives here rather than only in apps/supabase/migrations because Prisma cannot
-- express a CHECK, so `prisma db push` drops it during reconciliation; this
-- directory re-runs after every push and puts it back.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_posts_kind_check'
  ) THEN
    ALTER TABLE "feedback_posts"
      ADD CONSTRAINT "feedback_posts_kind_check"
      CHECK (kind = ANY (ARRAY['bug', 'feedback']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_posts_status_check'
  ) THEN
    ALTER TABLE "feedback_posts"
      ADD CONSTRAINT "feedback_posts_status_check"
      CHECK (status = ANY (ARRAY['open', 'planned', 'in_progress', 'done', 'closed']));
  END IF;
END $$;

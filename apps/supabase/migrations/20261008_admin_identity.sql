-- Who may operate the admin console, and what each person did there.
--
-- ENTRY is not decided here. Cloudflare Access in front of the console decides
-- who may reach it at all (team emails, second factor at the identity
-- provider), and the app verifies the Access token on every request. This
-- migration adds the two things Access cannot give us:
--
--   admin_users      the ROLE of each email: 'operator' may write, 'read-only'
--                    may look. An email allowed in by Access but absent here is
--                    read-only. `disabled_at` locks one person out of the app
--                    without touching anyone else or any shared secret.
--
--   admin_audit_log  one row per admin write: who, what, on which target, with
--                    which payload, from where, when. Append-only by convention;
--                    nothing in the app updates or deletes rows.
--
-- BOOTSTRAP. While admin_users has NO rows at all, every email Access lets in
-- counts as an operator, so the first person can add themselves and the rest
-- of the team from the console. The moment one row exists the rule above
-- applies. The audit row of that first insert records who did it.
--
-- Emails are stored lower-cased; the CHECK enforces it so two spellings of one
-- address cannot become two people.

CREATE TABLE IF NOT EXISTS "admin_users" (
  "email"       varchar(254)   PRIMARY KEY,
  -- 'operator' | 'read-only'
  "role"        varchar(16)    NOT NULL DEFAULT 'read-only',
  "created_at"  timestamptz(6) NOT NULL DEFAULT now(),
  -- The email that added the row, or 'service' for the x-admin-secret path.
  "created_by"  varchar(254)   NOT NULL,
  "disabled_at" timestamptz(6)
);

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id"          bigserial      PRIMARY KEY,
  "actor_email" varchar(254)   NOT NULL,
  -- '<area>.<verb>', e.g. 'rewards.update', 'users.disable'
  "action"      varchar(64)    NOT NULL,
  -- The id or key of the thing changed, as text; NULL for collection-level writes.
  "target"      varchar(128),
  -- The validated request body. Never a secret: the writers strip them.
  "payload"     jsonb,
  "ip"          varchar(64),
  "created_at"  timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_created"
  ON "admin_audit_log" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_actor_created"
  ON "admin_audit_log" ("actor_email", "created_at" DESC);

-- Same constraints as packages/db/sql/admin_enums.sql, which re-applies them
-- after every `prisma db push`.
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

COMMENT ON TABLE "admin_users" IS
  'Role per admin-console email. Entry is decided by Cloudflare Access; this table only says operator or read-only, and disabled_at locks one person out. Empty table = bootstrap, everyone Access admits is an operator.';
COMMENT ON TABLE "admin_audit_log" IS
  'One row per admin-console write: actor email, action, target, validated payload, source address. Append-only.';

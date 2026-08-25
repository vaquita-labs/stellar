-- push_subscriptions / push_campaigns: web-push state that reached development
-- and production without ever passing through this directory.
--
-- Both tables are declared in packages/db/prisma/schema.prisma (PushSubscription,
-- PushCampaign) and exist in dev and prod, but staging never got them — it was
-- behind on a `prisma db push` — so every push route 500s there against a
-- missing relation. This file writes the DDL down so the state is reproducible
-- from the repo instead of from whichever environment happened to be pushed.
--
-- The shape mirrors production exactly (column order, varchar lengths, index
-- names, FK actions), so a later `prisma db push` against any environment is a
-- no-op rather than a reconciliation.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"         serial       PRIMARY KEY,
  "profile_id" integer      NOT NULL,
  -- Push-service URL (FCM/APNs web push). Long enough to need TEXT.
  "endpoint"   text         NOT NULL,
  -- Client public key / auth secret (base64url) for payload encryption.
  "p256dh"     varchar(200) NOT NULL,
  "auth"       varchar(100) NOT NULL,
  "user_agent" varchar(300),
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
);

-- One row per browser endpoint: re-subscribing the same browser must update the
-- existing row, not accumulate duplicates that each get their own send.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON "push_subscriptions" ("endpoint");

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile
  ON "push_subscriptions" ("profile_id");

-- The one FK the schema does carry (Prisma emits it for the declared relation,
-- so prod has it): a deleted profile must not leave live push endpoints behind.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_profile_id_fkey'
  ) THEN
    ALTER TABLE "push_subscriptions"
      ADD CONSTRAINT "push_subscriptions_profile_id_fkey"
      FOREIGN KEY ("profile_id") REFERENCES "profiles" ("id")
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- Send history from the admin panel. One row per campaign: a snapshot of the
-- message, the audience it was aimed at, and the delivery counters. The in-app
-- notification itself lives in `notifications` — this table is only the push.
CREATE TABLE IF NOT EXISTS "push_campaigns" (
  "id"          serial       PRIMARY KEY,
  "title"       varchar(120) NOT NULL,
  "body"        varchar(500) NOT NULL,
  "link"        varchar(300),
  -- 'all' | 'usernames'
  "audience"    varchar(20)  NOT NULL,
  -- Only for audience='usernames': the nicknames that were requested.
  "usernames"   jsonb,
  -- Profiles that received the in-app notification.
  "recipients"  integer      NOT NULL DEFAULT 0,
  "push_sent"   integer      NOT NULL DEFAULT 0,
  "push_failed" integer      NOT NULL DEFAULT 0,
  "push_pruned" integer      NOT NULL DEFAULT 0,
  "created_at"  timestamptz(6) NOT NULL DEFAULT now()
);

-- The admin list is "most recent first" and nothing else.
CREATE INDEX IF NOT EXISTS idx_push_campaigns_created
  ON "push_campaigns" ("created_at" DESC);

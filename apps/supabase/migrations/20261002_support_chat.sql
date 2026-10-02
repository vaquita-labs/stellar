-- The private chat between a user and the team (Help Center → "Message the
-- team"), answered from apps/admin. No realtime transport: both sides poll.
--
-- ONE CONVERSATION PER WALLET. The user sees a single ongoing thread, not a
-- list of tickets. Keyed by wallet rather than profile, like `feedback_posts`:
-- it has to work for a user whose profile row is missing, and it outlives the
-- profile (ON DELETE SET NULL).
--
-- `last_message_at` / `last_message_author` ARE DENORMALIZED from the newest
-- message and written in the same transaction, so the admin inbox can sort and
-- split "waiting on us" from "answered" without scanning every thread.
--
-- `resolved_at` is set by an admin and cleared by any new message, which is
-- what puts a resolved thread back in the queue when the user writes again.

CREATE TABLE IF NOT EXISTS "support_conversations" (
  "id"                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id"          integer        REFERENCES "profiles" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "wallet_address"      varchar(64)    NOT NULL,
  "resolved_at"         timestamptz(6),
  "last_message_at"     timestamptz(6) NOT NULL DEFAULT now(),
  -- 'user' | 'team'
  "last_message_author" varchar(8)     NOT NULL DEFAULT 'user',
  "created_at"          timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"          timestamptz(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "support_conversations_wallet_unique"
  ON "support_conversations" ("wallet_address");

CREATE INDEX IF NOT EXISTS "idx_support_conversations_last_message"
  ON "support_conversations" ("last_message_at" DESC);

CREATE TABLE IF NOT EXISTS "support_messages" (
  "id"              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid           NOT NULL REFERENCES "support_conversations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  -- 'user' | 'team'
  "author"          varchar(8)     NOT NULL,
  "body"            text           NOT NULL,
  "created_at"      timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_support_messages_conversation_created"
  ON "support_messages" ("conversation_id", "created_at");

-- Same constraints as packages/db/sql/support_enums.sql, which re-applies them
-- after every `prisma db push`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_author_check'
  ) THEN
    ALTER TABLE "support_messages"
      ADD CONSTRAINT "support_messages_author_check"
      CHECK (author = ANY (ARRAY['user', 'team']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_conversations_last_message_author_check'
  ) THEN
    ALTER TABLE "support_conversations"
      ADD CONSTRAINT "support_conversations_last_message_author_check"
      CHECK (last_message_author = ANY (ARRAY['user', 'team']));
  END IF;
END $$;

COMMENT ON TABLE "support_conversations" IS
  'Private chat between one user and the team, one row per wallet. last_message_* are denormalized from support_messages.';
COMMENT ON TABLE "support_messages" IS
  'Messages of a support conversation. author is user or team.';

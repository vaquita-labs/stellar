-- Topics ("tickets") inside the one-per-wallet support conversation.
-- The admin inbox stays on support_conversations; the app lists tickets.
--
-- Backfill: every existing conversation becomes one ticket that owns all of
-- its messages, so nobody loses what they already wrote.

BEGIN;

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id"                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id"     uuid           NOT NULL REFERENCES "support_conversations" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "wallet_address"      varchar(64)    NOT NULL,
  "subject"             varchar(120)   NOT NULL,
  "opened_at"           timestamptz(6) NOT NULL,
  "resolved_at"         timestamptz(6),
  "last_message_at"     timestamptz(6) NOT NULL,
  -- 'user' | 'team'
  "last_message_author" varchar(8)     NOT NULL,
  "created_at"          timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"          timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_support_tickets_wallet_last_message"
  ON "support_tickets" ("wallet_address", "last_message_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_support_tickets_conversation_opened"
  ON "support_tickets" ("conversation_id", "opened_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_last_message_author_check'
  ) THEN
    ALTER TABLE "support_tickets"
      ADD CONSTRAINT "support_tickets_last_message_author_check"
      CHECK (last_message_author = ANY (ARRAY['user', 'team']));
  END IF;
END $$;

ALTER TABLE "support_messages"
  ADD COLUMN IF NOT EXISTS "ticket_id" uuid REFERENCES "support_tickets" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "idx_support_messages_ticket_created"
  ON "support_messages" ("ticket_id", "created_at");

-- One ticket per conversation that does not have one yet.
INSERT INTO "support_tickets" (
  "id",
  "conversation_id",
  "wallet_address",
  "subject",
  "opened_at",
  "resolved_at",
  "last_message_at",
  "last_message_author",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  c."id",
  c."wallet_address",
  COALESCE(
    NULLIF(LEFT(regexp_replace(trim(both FROM COALESCE(first."body", '')), '\s+', ' ', 'g'), 120), ''),
    '…'
  ),
  c."created_at",
  c."resolved_at",
  c."last_message_at",
  c."last_message_author",
  now(),
  now()
FROM "support_conversations" c
LEFT JOIN LATERAL (
  SELECT m."body"
  FROM "support_messages" m
  WHERE m."conversation_id" = c."id"
  ORDER BY m."created_at" ASC
  LIMIT 1
) first ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "support_tickets" t WHERE t."conversation_id" = c."id"
);

-- Point every message at its conversation's (single backfilled) ticket.
UPDATE "support_messages" m
SET "ticket_id" = t."id"
FROM "support_tickets" t
WHERE t."conversation_id" = m."conversation_id"
  AND m."ticket_id" IS NULL;

COMMENT ON TABLE "support_tickets" IS
  'Topics inside a wallet support conversation. Admin inbox stays on support_conversations.';
COMMENT ON COLUMN "support_messages"."ticket_id" IS
  'Ticket this message belongs to; SET NULL if the ticket is deleted.';

COMMIT;

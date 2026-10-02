-- support_messages.author and support_conversations.last_message_author are a
-- closed set. A typo'd value does not error anywhere: the message just renders
-- on the wrong side of the chat, and the thread drops out of the admin inbox's
-- "waiting on us" filter.
--
-- Lives here because Prisma cannot express a CHECK, so `prisma db push` drops
-- it during reconciliation; this directory re-runs after every push.
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

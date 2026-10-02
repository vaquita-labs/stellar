-- The receiving side of a peer-to-peer payment: "what did this user get sent?"
-- has no other index to use, and the column is NULL for every external send.
--
-- Lives here because Prisma cannot express a partial index, so `prisma db push`
-- drops it during reconciliation; this directory re-runs after every push and
-- puts it back.
CREATE INDEX IF NOT EXISTS "idx_wallet_transfers_destination_profile_id"
  ON "wallet_transfers" ("destination_profile_id")
  WHERE "destination_profile_id" IS NOT NULL;

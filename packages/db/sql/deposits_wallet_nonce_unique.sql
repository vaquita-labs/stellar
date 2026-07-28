-- Partial unique index guarding the one race that matters for the
-- client-supplied deposit nonce: two concurrent deposits from the same wallet
-- computing the same next value — the second insert fails and the client
-- retries with the next nonce. Partial (nonce set, row not soft-deleted) so a
-- deleted row does not block reusing its (wallet, nonce) pair.
--
-- Lives here as raw SQL because the Prisma schema language cannot express
-- partial indexes; the sql/ runner applies it after every `db push`.

CREATE UNIQUE INDEX IF NOT EXISTS deposits_wallet_nonce_unique
  ON "deposits" ("wallet_address", "nonce")
  WHERE "nonce" IS NOT NULL
    AND "deleted_at" IS NULL;

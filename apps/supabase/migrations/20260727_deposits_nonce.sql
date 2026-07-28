-- Client-supplied per-wallet deposit nonce for the new VaquitaPool contract.
--
-- The pool derives each position id as sha256(caller || nonce); the nonce is a
-- per-wallet monotonic counter generated off-chain (next = MAX(nonce)+1 for the
-- wallet). Keeping the counter off-chain avoids the on-chain TTL-reset collision
-- risk, and the derived id is bound to the caller so a predictable nonce is not
-- squattable.
--
-- The UNIQUE(wallet_address, nonce) index guards the one race that matters: two
-- concurrent deposits from the same wallet computing the same next value — the
-- second insert fails and the client retries with the next nonce.

ALTER TABLE "deposits"
  ADD COLUMN IF NOT EXISTS "nonce" bigint;

CREATE UNIQUE INDEX IF NOT EXISTS deposits_wallet_nonce_unique
  ON "deposits" ("wallet_address", "nonce")
  WHERE "nonce" IS NOT NULL
    AND "deleted_at" IS NULL;

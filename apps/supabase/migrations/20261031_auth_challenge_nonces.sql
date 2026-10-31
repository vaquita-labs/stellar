-- Wallet-login challenges already redeemed (POST /api/v1/auth/verify).
--
-- The API runs as several PM2 instances, so the challenge cannot live in one
-- process's memory: it carries its own HMAC (AUTH_SESSION_SECRET, the same on
-- every instance) and any instance can verify it. This table is what keeps it
-- single-use: the redeem inserts the nonce, and the primary key turns a second
-- redeem into a unique violation on whichever instance it lands.

CREATE TABLE IF NOT EXISTS "auth_challenge_nonces" (
  "nonce"          varchar(32)    PRIMARY KEY,
  "wallet_address" varchar(64)    NOT NULL,
  "expires_at"     timestamptz(6) NOT NULL,
  "created_at"     timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_auth_challenge_nonces_expires"
  ON "auth_challenge_nonces" ("expires_at");

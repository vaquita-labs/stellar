-- Admin Wallets tab: per-wallet snapshot of on-chain USDC positions (Blend +
-- DeFindex vault), read on-chain and cached here so the tab loads instantly and
-- only hits (rate-limited public) RPC on demand. Keyed by (wallet_address,
-- token_id) so scrapes/search upsert idempotently and it's multi-token ready.
-- No FK on token_id — relations are enforced at the application layer here.

CREATE TABLE IF NOT EXISTS "wallet_onchain_balances" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "wallet_address" varchar(100) NOT NULL,
  "token_id"       integer      NOT NULL,
  "blend_usdc"     numeric      NOT NULL DEFAULT 0,
  "vault_usdc"     numeric      NOT NULL DEFAULT 0,
  "scraped_at"     timestamptz  NOT NULL,
  "last_error"     text,
  "created_at"     timestamptz  NOT NULL DEFAULT now(),
  "updated_at"     timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_onchain_balances_wallet_token_unique
  ON "wallet_onchain_balances" ("wallet_address", "token_id");

CREATE INDEX IF NOT EXISTS idx_wallet_onchain_balances_token_id
  ON "wallet_onchain_balances" ("token_id");

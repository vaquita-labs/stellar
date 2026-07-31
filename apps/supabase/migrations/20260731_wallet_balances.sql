-- Admin Wallets tab: per-wallet snapshot of on-chain USDC positions (Blend +
-- DeFindex vault), read on-chain and cached here so the tab loads instantly and
-- only hits (rate-limited public) RPC on demand. Keyed by (wallet_address,
-- token_id) so scrapes/search upsert idempotently and it's multi-token ready.
-- No FK on token_id — relations are enforced at the application layer here.

-- vaquita_positions: the wallet's locked Vaquita-pool deposits, broken down by
-- lock period as a JSON array of { period, amount } (from the deposits table,
-- active = confirmed & not withdrawn).
CREATE TABLE IF NOT EXISTS "wallet_balances" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "wallet_address"    varchar(100) NOT NULL,
  "token_id"          integer      NOT NULL,
  "blend_usdc"        numeric      NOT NULL DEFAULT 0,
  "vault_usdc"        numeric      NOT NULL DEFAULT 0,
  "vaquita_positions" jsonb        NOT NULL DEFAULT '[]'::jsonb,
  "scraped_at"        timestamptz  NOT NULL,
  "last_error"        text,
  "created_at"        timestamptz  NOT NULL DEFAULT now(),
  "updated_at"        timestamptz  NOT NULL DEFAULT now()
);

-- Safety for a table created by an earlier version of this migration.
ALTER TABLE "wallet_balances"
  ADD COLUMN IF NOT EXISTS "vaquita_positions" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_balances_wallet_token_unique
  ON "wallet_balances" ("wallet_address", "token_id");

CREATE INDEX IF NOT EXISTS idx_wallet_balances_token_id
  ON "wallet_balances" ("token_id");

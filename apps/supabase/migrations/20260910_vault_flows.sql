-- Event ledger for the flexible DeFindex vault: the counterpart to `deposits`.
--
-- A locked-pool deposit is a contract call we broker, so the server sees it and
-- writes a row. A vault deposit is the user calling the vault directly, so the
-- server sees nothing at all. Everything downstream that asks "who did what,
-- when?" was therefore locked-only: a saver who funds the flexible vault and
-- never locks reads as never activated, falls out of the signup funnel, is
-- invisible to campaign ROI, appears in no retention cohort, and can never
-- unlock a deposit badge. The vault is the path the deposit sheet offers first
-- to non-web3 users, so that is exactly the cohort being dropped.
--
-- NO `initiated` -> `confirmed` HANDSHAKE, deliberately. `deposits` needs one
-- because a locked deposit carries a caller-chosen `deposit_id` to match against
-- chain state. The vault has no such id — only a fungible share balance — so
-- there is nothing to match and nothing to repair. Rows land already confirmed,
-- on the hash the wallet returned.
--
-- THE CLIENT IS THE WRITER. A dropped write (browser closed after signing,
-- failed POST) is silent and permanent: Soroban RPC keeps ~7 days of events, the
-- vault exposes a balance rather than a position list, and no job can
-- reconstruct a missing row's amount, direction or timestamp. That is the
-- accepted cost of not running an indexer at this scale. `transaction_hash` is
-- UNIQUE so the client can simply retry — which is the whole mitigation — and so
-- a replayed POST cannot pay the deposit coin grant twice.
--
-- NOT BACKFILLABLE. The series starts on this migration's deploy date. Vault
-- activity before then is not recoverable from any source.

CREATE TABLE IF NOT EXISTS "vault_flows" (
  "id"               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  "wallet_address"   varchar(100)   NOT NULL,
  -- Plain scalar, no FK: relations are enforced app-side throughout this schema.
  "token_id"         integer        NOT NULL,
  -- 'deposit' | 'withdraw'  (CHECK in packages/db/sql/vault_flows_enums.sql)
  "direction"        varchar(10)    NOT NULL,
  -- 'external_in' | 'external_out' | 'internal_in' | 'internal_out'
  --
  -- Load-bearing, not decoration. Four of the client call sites move money
  -- between Vaquita's own products (flexible -> locked, locked -> flexible,
  -- legacy Blend -> vault). Counted as external, moving 100 USDC sideways would
  -- add 200 to total volume, pay coins the user did not earn, and inflate the
  -- badge deposit count. Metrics and rewards must filter on this column.
  "flow_kind"        varchar(16)    NOT NULL,
  -- Human units (USDC), like `deposits.amount`. Decimal rather than the varchar
  -- the client-reported ramp rows use, because the dashboard SUMs it.
  "amount"           numeric        NOT NULL,
  "transaction_hash" varchar(100)   NOT NULL,
  "confirmed_at"     timestamptz(6) NOT NULL,
  "created_at"       timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"       timestamptz(6) NOT NULL DEFAULT now(),
  "deleted_at"       timestamptz(6)
);

-- Idempotence for the client retry, and the guard against double-paying coins.
CREATE UNIQUE INDEX IF NOT EXISTS "vault_flows_transaction_hash_unique"
  ON "vault_flows" ("transaction_hash");

CREATE INDEX IF NOT EXISTS "idx_vault_flows_wallet_address"
  ON "vault_flows" ("wallet_address");

CREATE INDEX IF NOT EXISTS "idx_vault_flows_confirmed_at"
  ON "vault_flows" ("confirmed_at");

COMMENT ON TABLE "vault_flows" IS
  'Client-reported event ledger for flexible DeFindex vault deposits and withdrawals. Not backfillable, and nothing can repair a missing row.';
COMMENT ON COLUMN "vault_flows"."flow_kind" IS
  'external_in | external_out | internal_in | internal_out. Internal flows move money between Vaquita products and must be excluded from volume, coins and badge counts.';
COMMENT ON COLUMN "vault_flows"."transaction_hash" IS
  'Stellar tx hash the wallet returned. UNIQUE: it is the join key the vault does not otherwise provide, and the reason a retried write is free.';

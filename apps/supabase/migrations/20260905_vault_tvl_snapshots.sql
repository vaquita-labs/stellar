-- Sampled DeFindex vault TVL: what the Vaquita pool's vault actually holds.
--
-- The metrics dashboard used to draw "TVL" from the deposits ledger (confirmed
-- deposits minus withdrawals). That is *locked principal* — it ignores accrued
-- yield, and it ignores the flexible balances supplied to the same vault, so it
-- reads permanently low and drifts further the longer the vault runs. The vault
-- knows the real number; this table is how a DB-only dashboard gets to see it.
--
-- APPEND-ONLY, unlike `vault_apy_snapshots` (one upserted row per vault). A rate
-- is a fact about now and only the latest matters; TVL is a curve, and the chart
-- is the point. Rows are written best-effort from the API's vault-APY path, so
-- sampling follows traffic: dense while people use the app, sparse overnight.
-- Chart queries must therefore take the LAST sample per bucket, never an average.
--
-- Disposable: truncating loses history but breaks nothing, and the series
-- refills from live reads.

CREATE TABLE IF NOT EXISTS "vault_tvl_snapshots" (
  "id"            bigserial        PRIMARY KEY,
  "network"       varchar(20)      NOT NULL,
  "vault_address" varchar(128)     NOT NULL,
  -- Human units (already divided by the token's decimals), so every reader does
  -- not need to know the token to plot the number.
  "total_managed" double precision NOT NULL,
  "total_supply"  double precision,
  "fetched_at"    timestamptz(6)   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_vault_tvl_snapshots_vault_time"
  ON "vault_tvl_snapshots" ("network", "vault_address", "fetched_at" DESC);

COMMENT ON TABLE "vault_tvl_snapshots" IS
  'Append-only samples of DeFindex vault total managed funds. Disposable, safe to truncate.';
COMMENT ON COLUMN "vault_tvl_snapshots"."total_managed" IS
  'Idle + invested, in human units. The vault total, not the pool''s locked principal.';

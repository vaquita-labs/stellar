-- Last-known-good DeFindex vault APY, persisted so a cold process can still
-- show a rate while the DeFindex API is unavailable.
--
-- `getVaultApy` caches the vault rate in memory (10 min TTL, single-flight,
-- stale-on-error), but that cache dies with the process: a restart during a
-- DeFindex outage leaves it with nothing to serve and the API falls back to
-- `protocolApy: 0`, which renders to users as a real-looking 0% APY. This
-- table is the durable floor under that in-memory cache.
--
-- Deliberately NOT a column on `tokens` or `config`: those are human-edited
-- configuration whose `updated_at` should mean "someone changed the config",
-- and this row is machine-written every 10 minutes. Keeping derived, freely
-- disposable cache state in its own table keeps the two lifecycles apart —
-- this table can be truncated at any time with no loss beyond one cold start.
--
-- Keyed by (network, vault_address) to match the in-memory cache key exactly.

CREATE TABLE IF NOT EXISTS "vault_apy_snapshots" (
  "network"       varchar(20)      NOT NULL,
  "vault_address" varchar(128)     NOT NULL,
  "apy"           double precision NOT NULL,
  "fetched_at"    timestamptz(6)   NOT NULL DEFAULT now(),
  CONSTRAINT "vault_apy_snapshots_pkey" PRIMARY KEY ("network", "vault_address")
);

COMMENT ON TABLE "vault_apy_snapshots" IS
  'Last successful DeFindex vault APY read per (network, vault). Disposable cache state, safe to truncate.';
COMMENT ON COLUMN "vault_apy_snapshots"."fetched_at" IS
  'When this rate was last confirmed live upstream; readers reject snapshots older than their max age.';

-- Append-only history of `wallet_balances`, one row per successful on-chain read.
--
-- `wallet_balances` holds a single current row per (wallet, token). The moment a
-- refresh overwrites it the previous reading is gone, so there is nothing to
-- check the flexible vault ledger against and no way to answer "what did this
-- wallet hold last month". This table is that record.
--
-- A SAMPLE, NOT A SERIES. Balances refresh lazily, when a wallet interacts with
-- the app, and the sweep workflow is `workflow_dispatch` only — reads are
-- sequential against a rate-limited public RPC (~1.7 s/wallet; concurrency 5+
-- drew 75-100% HTTP 429s). Row density therefore follows traffic: a wallet that
-- never opens Vaquita produces no rows, and a gap between two rows is not
-- evidence the balance sat still. Read it the way `vault_tvl_snapshots` is read
-- — last value at or before a point in time, never an average.
--
-- SUCCESS PATH ONLY. `refreshWalletBalances` leaves the stale balance in place
-- when a read fails, because a failed read is not an observation. A row here on
-- that branch would record a fake zero and read as a withdrawal to anything
-- taking deltas.
--
-- No FK on `token_id`: relations are enforced app-side throughout this schema.

CREATE TABLE IF NOT EXISTS "wallet_balance_history" (
  "id"               bigserial      PRIMARY KEY,
  "wallet_address"   varchar(100)   NOT NULL,
  "token_id"         integer        NOT NULL,
  "blend_usdc"       numeric        NOT NULL,
  "vault_usdc"       numeric        NOT NULL,
  -- The XP accumulator as of this reading, so a row is self-contained.
  "vault_usdc_hours" numeric        NOT NULL,
  -- The instant the balance was measured — the same value written to
  -- `wallet_balances.observed_at` in the same transaction.
  "observed_at"      timestamptz(6) NOT NULL,
  "created_at"       timestamptz(6) NOT NULL DEFAULT now()
);

-- Descending on time: every read of this table is "the latest row at or before
-- X for this wallet", which is a `distinct on (...) order by ... desc` scan.
CREATE INDEX IF NOT EXISTS "idx_wallet_balance_history_wallet_token_time"
  ON "wallet_balance_history" ("wallet_address", "token_id", "observed_at" DESC);

COMMENT ON TABLE "wallet_balance_history" IS
  'Append-only samples of wallet_balances, written only when an on-chain read succeeded. Density follows traffic, so gaps are not evidence the balance was flat.';

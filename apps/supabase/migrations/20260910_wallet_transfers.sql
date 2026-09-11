-- Event ledger for USDC leaving a user's wallet by payment: the missing third
-- of the money picture.
--
-- Three products already write a row when money moves. `deposits` covers locked
-- savings, `vault_flows` covers the flexible vault, `offramp_withdrawals` covers
-- a bank payout. A plain payment out of the wallet wrote nothing at all, and
-- that one code path is BOTH features the send sheet offers: paying another
-- Vaquita user by @username, and sending to any Stellar address. So the two
-- movements the product talks about most — peer to peer, and cashing out to your
-- own wallet — were the two the dashboard could not see.
--
-- It is also why the withdraw sheet under-reported. Hop 1 writes a vault
-- `external_out` (money leaving savings); hop 2 pays it onward and wrote
-- nothing, so a withdrawal to an outside address looked like it stopped in the
-- wallet and stayed inside Vaquita.
--
-- WHY `destination_kind` IS STORED AND NOT DERIVED. The question a reader asks
-- is "was this a payment to a Vaquita user *at the time*". Resolving the address
-- against `profiles` at read time answers a different question every month:
-- profiles are deleted, wallets rotate, and an address nobody owns today may
-- belong to a profile next week. Worse, this column is what decides which
-- boundary the row counts against — a payment to a Vaquita user never leaves the
-- app, a payment to an outside address does — so a value that drifts moves
-- historical volume between two totals. The server resolves it once, at insert.
--
-- THE CLIENT IS THE WRITER, exactly as in `vault_flows`, and with the same
-- accepted cost: a dropped write is silent and permanent, because Soroban RPC
-- keeps ~7 days of events and no job can reconstruct a missing row.
-- `transaction_hash` is UNIQUE so a retry is free.
--
-- NOT BACKFILLABLE. The series starts on this migration's deploy date.

CREATE TABLE IF NOT EXISTS "wallet_transfers" (
  "id"                     uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The sender, always taken from the session and never from the request body.
  "wallet_address"         varchar(100)   NOT NULL,
  -- Plain scalar, no FK: relations are enforced app-side throughout this schema.
  "token_id"               integer        NOT NULL,
  -- Human units (USDC), like `deposits.amount` and `vault_flows.amount`. Decimal
  -- rather than the varchar the client-reported ramp rows use, because the
  -- dashboard SUMs it.
  "amount"                 numeric        NOT NULL,
  -- The resolved G… address. An @username is resolved to this before sending, so
  -- a handle is never stored: handles are renameable, addresses are not.
  "destination_address"    varchar(100)   NOT NULL,
  -- 'vaquita_user' | 'external'  (CHECK in packages/db/sql/wallet_transfers_enums.sql)
  --
  -- Load-bearing. A payment to another Vaquita user moves ownership without the
  -- money leaving the app; a payment to an outside address is money gone. Those
  -- are two different totals, and this column is the only thing that separates
  -- them.
  "destination_kind"       varchar(16)    NOT NULL,
  -- Set when the destination resolved to a profile, so the receiving side is
  -- attributable without re-resolving an address that may have changed hands.
  "destination_profile_id" integer,
  "transaction_hash"       varchar(100)   NOT NULL,
  "confirmed_at"           timestamptz(6) NOT NULL,
  "created_at"             timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"             timestamptz(6) NOT NULL DEFAULT now(),
  "deleted_at"             timestamptz(6)
);

-- Idempotence for the client retry: the same reason vault_flows has it.
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transfers_transaction_hash_unique"
  ON "wallet_transfers" ("transaction_hash");

CREATE INDEX IF NOT EXISTS "idx_wallet_transfers_wallet_address"
  ON "wallet_transfers" ("wallet_address");

CREATE INDEX IF NOT EXISTS "idx_wallet_transfers_confirmed_at"
  ON "wallet_transfers" ("confirmed_at");

-- The receiving side of a peer-to-peer payment: "what did this user get sent?"
-- has no other index to use, and the column is NULL for every external send.
CREATE INDEX IF NOT EXISTS "idx_wallet_transfers_destination_profile_id"
  ON "wallet_transfers" ("destination_profile_id")
  WHERE "destination_profile_id" IS NOT NULL;

COMMENT ON TABLE "wallet_transfers" IS
  'Client-reported ledger of USDC payments out of a user wallet: peer-to-peer sends and sends to outside addresses. Not backfillable, and nothing can repair a missing row.';
COMMENT ON COLUMN "wallet_transfers"."destination_kind" IS
  'vaquita_user | external. Decides whether the row counts as money changing hands inside the app or money leaving it. Resolved server-side at insert, never derived at read time.';
COMMENT ON COLUMN "wallet_transfers"."transaction_hash" IS
  'Stellar tx hash the wallet returned. UNIQUE: it is the whole idempotency story, and the reason a retried write is free.';

-- saved_wallets: payout wallets the user saved for the withdraw flow.
--
-- Withdrawing to an exchange or a self-custody wallet meant pasting a long
-- address every single time — the highest-stakes copy/paste in the product,
-- where one wrong character burns the funds. This table lets the user save an
-- address once under a name they recognise ("Binance Solana usdc") and pick it
-- from a list afterwards.
--
-- `network` is one of the supported network keys (see CCTP_NETWORKS in
-- @vaquita/shared) — the same address can legitimately exist on more than one
-- network, so the uniqueness key includes it. Rows are soft-deleted (deleted_at)
-- rather than removed: a deleted entry must never reappear in the picker, but
-- historical withdrawals still need to resolve the label it was sent under.

CREATE TABLE IF NOT EXISTS saved_wallets (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id INTEGER      NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label      VARCHAR(60)  NOT NULL,
  address    VARCHAR(128) NOT NULL,
  network    VARCHAR(40)  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT saved_wallets_unique_address UNIQUE (profile_id, address, network)
);

CREATE INDEX IF NOT EXISTS idx_saved_wallets_profile_id
  ON saved_wallets(profile_id);

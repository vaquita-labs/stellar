-- Track on-chain mint confirmation for badge claims.

ALTER TABLE badge_claims
  ADD COLUMN IF NOT EXISTS confirmed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_hash text;

CREATE INDEX IF NOT EXISTS idx_badge_claims_confirmed
  ON badge_claims (wallet_address, badge_type)
  WHERE confirmed_at IS NOT NULL;

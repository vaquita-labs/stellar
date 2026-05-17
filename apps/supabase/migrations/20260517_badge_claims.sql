-- Badge claims: stores signed claim payloads issued by the backend signer.
-- One active (non-superseded) row per (wallet, badge_type, cycle_id).

CREATE TABLE IF NOT EXISTS badge_claims (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address   text        NOT NULL,
  badge_type       text        NOT NULL,
  cycle_id         integer     NOT NULL DEFAULT 0,
  expiry           timestamptz NOT NULL,
  signature        text        NOT NULL,   -- hex-encoded Ed25519 signature
  created_at       timestamptz NOT NULL DEFAULT now(),
  superseded_at    timestamptz             -- NULL = active claim
);

CREATE INDEX IF NOT EXISTS idx_badge_claims_active
  ON badge_claims (wallet_address, badge_type, cycle_id)
  WHERE superseded_at IS NULL;

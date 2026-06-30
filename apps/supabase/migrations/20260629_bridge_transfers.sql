CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "bridge_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "direction" varchar(32) NOT NULL,
  "source_network" varchar(40) NOT NULL,
  "destination_network" varchar(40) NOT NULL,
  "source_wallet" varchar(128) NOT NULL,
  "destination_wallet" varchar(128) NOT NULL,
  "amount" varchar(80) NOT NULL,
  "amount_raw" varchar(80) NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'source_awaiting_signature',
  "source_tx_hash" varchar(128),
  "destination_tx_hash" varchar(128),
  "message_hash" varchar(128),
  "cctp_message" text,
  "cctp_attestation" text,
  "error_reason" text,
  "retry_count" integer NOT NULL DEFAULT 0,
  "last_polled_at" timestamptz,
  "processing_lease_until" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS bridge_transfers_source_tx_unique
  ON "bridge_transfers" ("source_tx_hash")
  WHERE "source_tx_hash" IS NOT NULL
    AND "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS idx_bridge_transfers_source_wallet
  ON "bridge_transfers" ("source_wallet");

CREATE INDEX IF NOT EXISTS idx_bridge_transfers_destination_wallet
  ON "bridge_transfers" ("destination_wallet");

CREATE INDEX IF NOT EXISTS idx_bridge_transfers_status_updated
  ON "bridge_transfers" ("status", "updated_at");

CREATE INDEX IF NOT EXISTS idx_bridge_transfers_worker_queue
  ON "bridge_transfers" ("status", "processing_lease_until", "updated_at")
  WHERE "status" IN ('source_confirming', 'attestation_pending', 'destination_confirming')
    AND "deleted_at" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "bridge_transfers" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "bridge_transfers" TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "bridge_transfers" TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "bridge_transfers" TO supabase_admin;
  END IF;
END $$;

-- Reconciliation can backfill missing deposit rows from VaquitaPool events.
-- Guard idempotency at the database layer so the same on-chain deposit cannot
-- create multiple active rows for the same pool contract.
-- Historical rows may have NULL or blank deposit_id_hex placeholders before
-- contract confirmation; those are not real on-chain deposit IDs.
CREATE UNIQUE INDEX IF NOT EXISTS deposits_contract_deposit_id_unique
  ON "deposits" ("vaquita_contract_address", "deposit_id_hex")
  WHERE "vaquita_contract_address" IS NOT NULL
    AND "deposit_id_hex" IS NOT NULL
    AND btrim("deposit_id_hex") <> ''
    AND "deleted_at" IS NULL;

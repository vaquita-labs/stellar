-- bridge_transfers.status now stores the 1Click status verbatim. A value outside
-- the set is not an error anywhere in code — the row just never matches the
-- "still moving" predicate, so it stops being refreshed and the user's transfer
-- appears frozen forever.
--
-- The legacy CCTP values are still allowed because the rows that carry them are
-- real transfer history and apps/metrics groups by this column. Nothing writes
-- them any more; they are here so the constraint can be added without rewriting
-- what actually happened.
--
-- Lives here rather than only in apps/supabase/migrations because Prisma cannot
-- express a CHECK, so `prisma db push` drops it during reconciliation; this
-- directory re-runs after every push and puts it back.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bridge_transfers_status_check'
  ) THEN
    ALTER TABLE "bridge_transfers"
      ADD CONSTRAINT "bridge_transfers_status_check"
      CHECK (status = ANY (ARRAY[
        -- 1Click
        'PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'INCOMPLETE_DEPOSIT',
        'PROCESSING', 'SUCCESS', 'REFUNDED', 'FAILED',
        -- legacy CCTP, historical rows only
        'source_awaiting_signature', 'source_confirming', 'attestation_pending',
        'ready_to_complete', 'destination_awaiting_signature',
        'destination_confirming', 'completed', 'failed', 'cancelled', 'needs_review'
      ]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bridge_transfers_direction_check'
  ) THEN
    ALTER TABLE "bridge_transfers"
      ADD CONSTRAINT "bridge_transfers_direction_check"
      CHECK (direction = ANY (ARRAY['evm_to_stellar', 'stellar_to_evm']));
  END IF;
END $$;

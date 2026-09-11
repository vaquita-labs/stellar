-- wallet_transfers.destination_kind is a closed set, and a typo in it is worse
-- than an error: the row still saves, still counts as a transfer, and then lands
-- in neither the peer-to-peer total nor the money-left-the-app total. The money
-- moved; both ledgers say nothing happened.
--
-- Lives here rather than only in apps/supabase/migrations because Prisma cannot
-- express a CHECK, so `prisma db push` drops it during reconciliation; this
-- directory re-runs after every push and puts it back.
DO $$
BEGIN
  -- A payment to another Vaquita user never leaves the app; a payment to an
  -- outside address is money gone. The dashboard reports those as two separate
  -- boundaries, so a third value would silently belong to neither.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transfers_destination_kind_check'
  ) THEN
    ALTER TABLE "wallet_transfers"
      ADD CONSTRAINT "wallet_transfers_destination_kind_check"
      CHECK (destination_kind = ANY (ARRAY['vaquita_user', 'external']));
  END IF;

  -- The ledger is what the dashboard sums. A negative or zero amount is never a
  -- real payment.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transfers_amount_check'
  ) THEN
    ALTER TABLE "wallet_transfers"
      ADD CONSTRAINT "wallet_transfers_amount_check"
      CHECK (amount > 0);
  END IF;

  -- Paying yourself is not volume: nothing changed hands and nothing left. The
  -- send sheet blocks it and the API refuses it; this is the backstop, because a
  -- self-send that got through would inflate every total it touched.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transfers_destination_self_check'
  ) THEN
    ALTER TABLE "wallet_transfers"
      ADD CONSTRAINT "wallet_transfers_destination_self_check"
      CHECK (destination_address <> wallet_address);
  END IF;

  -- 'external' means "we could not find a profile for this address", so carrying
  -- a profile id would contradict the column the dashboard splits on. The pair
  -- has to agree or the two boundaries stop being disjoint.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transfers_destination_profile_check'
  ) THEN
    ALTER TABLE "wallet_transfers"
      ADD CONSTRAINT "wallet_transfers_destination_profile_check"
      CHECK (destination_kind = 'vaquita_user' OR destination_profile_id IS NULL);
  END IF;
END $$;

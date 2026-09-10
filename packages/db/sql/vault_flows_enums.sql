-- vault_flows.direction and .flow_kind are closed sets, and a typo in either is
-- worse than an error: the row still saves, still counts as a vault flow, and
-- then quietly falls out of every filter that pays coins, counts badge deposits
-- or sums volume. The money moved; the ledger says nothing happened.
--
-- Lives here rather than only in apps/supabase/migrations because Prisma cannot
-- express a CHECK, so `prisma db push` drops it during reconciliation; this
-- directory re-runs after every push and puts it back.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vault_flows_direction_check'
  ) THEN
    ALTER TABLE "vault_flows"
      ADD CONSTRAINT "vault_flows_direction_check"
      CHECK (direction = ANY (ARRAY['deposit', 'withdraw']));
  END IF;

  -- Internal flows move money between Vaquita's own products (flexible -> locked,
  -- locked -> flexible, legacy Blend -> vault). They are real rows and belong in
  -- the ledger, but counting one as external double-counts volume and pays coins
  -- for money the user already had.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vault_flows_flow_kind_check'
  ) THEN
    ALTER TABLE "vault_flows"
      ADD CONSTRAINT "vault_flows_flow_kind_check"
      CHECK (flow_kind = ANY (ARRAY['external_in', 'external_out', 'internal_in', 'internal_out']));
  END IF;

  -- A deposit cannot be an outflow and a withdrawal cannot be an inflow. Without
  -- this the two columns can disagree, and every reader picks a different one.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vault_flows_direction_flow_kind_check'
  ) THEN
    ALTER TABLE "vault_flows"
      ADD CONSTRAINT "vault_flows_direction_flow_kind_check"
      CHECK (
        (direction = 'deposit'  AND flow_kind IN ('external_in',  'internal_in'))
        OR
        (direction = 'withdraw' AND flow_kind IN ('external_out', 'internal_out'))
      );
  END IF;

  -- The ledger is what the dashboard sums and what the coin grant reads. A
  -- negative or zero amount is never a real flow.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vault_flows_amount_check'
  ) THEN
    ALTER TABLE "vault_flows"
      ADD CONSTRAINT "vault_flows_amount_check"
      CHECK (amount > 0);
  END IF;
END $$;

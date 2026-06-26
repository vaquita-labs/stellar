-- Store mainnet reconciliation cursors and last-run summaries on the singleton
-- config row. The value is keyed by job and VaquitaPool contract ID so later
-- workflows can reconcile multiple deployments without introducing a separate
-- cursor table.

ALTER TABLE config
  ADD COLUMN IF NOT EXISTS reconciliation_state jsonb NOT NULL DEFAULT '{}'::jsonb;

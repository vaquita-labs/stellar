-- ============================================================================
-- Deliverable 2.3 — VaquitaPool 4-panel Dune dashboard  (FINAL)
-- Table: dune.<handle>.vaquita_events   (replace <handle> with your Dune handle)
--
-- Each block = one Dune query -> one visualization -> one panel.
-- The shared `ev` CTE de-dupes by event_id so re-inserts never double-count.
-- Requires the withdraw event to carry `early_fee` (0 on the matured path).
--
-- MULTI-ENVIRONMENT: the table holds every deployment (dev, stage, …) tagged
-- with an `environment` column. Each query filters by a Dune text parameter
-- `{{environment}}` (create it on the dashboard, default e.g. "dev"). To show
-- ALL environments at once, set the parameter to '%' — the filter uses LIKE.
-- ============================================================================


-- ============================================================
-- PANEL 1 — WALLETS  (unique depositors)        Visualization: Counter
-- ============================================================
WITH ev AS (
  SELECT environment, event_name, caller, deposit_id, amount, reward, early_fee, ledger, ledger_closed_at
  FROM (
    SELECT *, row_number() OVER (PARTITION BY event_id ORDER BY ledger) AS rn
    FROM dune.<handle>.vaquita_events
    WHERE environment LIKE '{{environment}}'
  ) WHERE rn = 1
)
SELECT count(DISTINCT caller) AS wallets
FROM ev
WHERE event_name = 'deposit' AND caller <> '';


-- ============================================================
-- PANEL 2 — TVL  (principal still locked, over time)   Visualization: Area chart
--   x = hour, y = tvl
--   withdraw.amount is the PAYOUT, not principal, so recover the original
--   principal by joining each withdrawal back to its deposit on deposit_id.
--   deposit_id is only unique within an environment, so join on it too.
-- ============================================================
WITH ev AS (
  SELECT environment, event_name, caller, deposit_id, amount, reward, early_fee, ledger, ledger_closed_at
  FROM (
    SELECT *, row_number() OVER (PARTITION BY event_id ORDER BY ledger) AS rn
    FROM dune.<handle>.vaquita_events
    WHERE environment LIKE '{{environment}}'
  ) WHERE rn = 1
),
dep AS (
  SELECT environment, deposit_id, amount, ledger_closed_at AS ts FROM ev WHERE event_name = 'deposit'
),
wd AS (
  SELECT environment, deposit_id, ledger_closed_at AS ts FROM ev WHERE event_name = 'withdraw'
),
flows AS (
  SELECT ts, amount AS delta FROM dep                                          -- deposit: +principal
  UNION ALL
  SELECT wd.ts, -dep.amount FROM wd JOIN dep USING (environment, deposit_id)   -- withdraw: -original principal
)
SELECT hour, SUM(delta) OVER (ORDER BY hour) AS tvl
FROM (SELECT date_trunc('hour', ts) AS hour, SUM(delta) AS delta FROM flows GROUP BY 1)
ORDER BY hour;


-- ============================================================
-- PANEL 3 — COMPLETED CYCLES  (positions held to maturity)   Visualization: Counter
--   A cycle "completes" when a position reaches maturity and is withdrawn with
--   no early-withdrawal penalty (early_fee = 0). Early exits are excluded.
--   Want EVERY closed position instead? Drop the early_fee filter.
-- ============================================================
WITH ev AS (
  SELECT environment, event_name, caller, deposit_id, amount, reward, early_fee, ledger, ledger_closed_at
  FROM (
    SELECT *, row_number() OVER (PARTITION BY event_id ORDER BY ledger) AS rn
    FROM dune.<handle>.vaquita_events
    WHERE environment LIKE '{{environment}}'
  ) WHERE rn = 1
)
SELECT count(*) AS completed_cycles
FROM ev
WHERE event_name = 'withdraw' AND early_fee = 0;


-- ============================================================
-- PANEL 4 — PENALTIES COLLECTED  (early-withdrawal fees charged)   Visualization: Counter
--   Now exact and live: sums the per-withdrawal early_fee as it is charged,
--   independent of when the admin sweeps protocol fees.
-- ============================================================
WITH ev AS (
  SELECT environment, event_name, caller, deposit_id, amount, reward, early_fee, ledger, ledger_closed_at
  FROM (
    SELECT *, row_number() OVER (PARTITION BY event_id ORDER BY ledger) AS rn
    FROM dune.<handle>.vaquita_events
    WHERE environment LIKE '{{environment}}'
  ) WHERE rn = 1
)
SELECT COALESCE(SUM(early_fee), 0) AS penalties_collected
FROM ev
WHERE event_name = 'withdraw';

-- ============================================================================
-- Deliverable 2.3 — VaquitaPool 5-panel Dune dashboard  (FINAL)
-- Table: dune.<handle>.vaquita_pool_events   (replace <handle> with your Dune handle)
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
    FROM dune.<handle>.vaquita_pool_events
    WHERE environment LIKE '{{environment}}'
  ) WHERE rn = 1
)
SELECT count(DISTINCT caller) AS wallets
FROM ev
WHERE event_name = 'deposit' AND caller <> '';


-- ============================================================
-- PANEL 2 — TVL  (net funds deposited, over time)   Visualization: Area chart
--   x = hour, y = tvl
--   Funds don't sit in the pool — they're routed to the DeFindex vault — so
--   "value locked" = net of what users put in vs took out:
--       cumulative( SUM(deposit.amount) - SUM(withdraw.amount) ).
--   This flow-based sum avoids any deposit<->withdraw join, which matters
--   because deposit_id is reused across cycles (a join would mis-match).
--   Note: withdraw.amount is the payout, so a matured withdrawal also returns
--   its reward share; for this dashboard that net-flow view is the intent.
-- ============================================================
WITH ev AS (
  SELECT environment, event_name, amount, ledger_closed_at
  FROM (
    SELECT *, row_number() OVER (PARTITION BY event_id ORDER BY ledger) AS rn
    FROM dune.<handle>.vaquita_pool_events
    WHERE environment LIKE '{{environment}}'
  ) WHERE rn = 1
),
flows AS (
  SELECT date_trunc('hour', ledger_closed_at) AS hour,
         SUM(CASE event_name WHEN 'deposit' THEN amount WHEN 'withdraw' THEN -amount ELSE 0 END) AS delta
  FROM ev
  WHERE event_name IN ('deposit', 'withdraw')
  GROUP BY 1
)
SELECT hour, SUM(delta) OVER (ORDER BY hour) AS tvl
FROM flows
ORDER BY hour;


-- ============================================================
-- PANEL 3 — COMPLETED CYCLES  (positions held to maturity)   Visualization: Counter
--   A cycle "completes" when a position is withdrawn at/after maturity. The
--   contract sets `matured` on the withdraw event, so filter on that directly.
--   (Don't use early_fee = 0 — that's also true for an early exit that earned
--    no interest, so it would over-count.)
-- ============================================================
WITH ev AS (
  SELECT environment, event_name, matured
  FROM (
    SELECT *, row_number() OVER (PARTITION BY event_id ORDER BY ledger) AS rn
    FROM dune.<handle>.vaquita_pool_events
    WHERE environment LIKE '{{environment}}'
  ) WHERE rn = 1
)
SELECT count(*) AS completed_cycles
FROM ev
WHERE event_name = 'withdraw' AND matured;


-- ============================================================
-- PANEL 4 — PENALTIES COLLECTED  (early-withdrawal fees charged)   Visualization: Counter
--   Now exact and live: sums the per-withdrawal early_fee as it is charged,
--   independent of when the admin sweeps protocol fees.
-- ============================================================
WITH ev AS (
  SELECT environment, event_name, caller, deposit_id, amount, reward, early_fee, ledger, ledger_closed_at
  FROM (
    SELECT *, row_number() OVER (PARTITION BY event_id ORDER BY ledger) AS rn
    FROM dune.<handle>.vaquita_pool_events
    WHERE environment LIKE '{{environment}}'
  ) WHERE rn = 1
)
SELECT COALESCE(SUM(early_fee), 0) AS penalties_collected
FROM ev
WHERE event_name = 'withdraw';


-- ============================================================
-- PANEL 5 — ACTIVE VS MATURED DEPOSITS BY LOCK PERIOD     Visualization: Grouped bar chart
--   x = lock_period, y = deposits, series = status
--
--   `lock_period` is stored in seconds. Historical rows in
--   dune.<handle>.vaquita_pool_events are enriched from the app database; new
--   contract deployments emit it directly in the event payload.
-- ============================================================
WITH ev AS (
  SELECT
    environment,
    event_id,
    ledger,
    event_name,
    caller,
    deposit_id,
    amount,
    lock_period,
    matured,
    ledger_closed_at
  FROM (
    SELECT *, row_number() OVER (PARTITION BY event_id ORDER BY ledger) AS rn
    FROM dune.<handle>.vaquita_pool_events
    WHERE environment LIKE '{{environment}}'
  )
  WHERE rn = 1
),
sequenced AS (
  SELECT
    *,
    SUM(CASE WHEN event_name = 'deposit' THEN 1 ELSE 0 END) OVER (
      PARTITION BY environment, deposit_id
      ORDER BY ledger, event_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cycle_no
  FROM ev
  WHERE event_name IN ('deposit', 'withdraw')
    AND deposit_id <> ''
),
deposits AS (
  SELECT
    environment,
    deposit_id,
    cycle_no,
    TRY_CAST(lock_period AS bigint) AS lock_period_seconds,
    amount
  FROM sequenced
  WHERE event_name = 'deposit'
),
withdrawals AS (
  SELECT
    environment,
    deposit_id,
    cycle_no,
    bool_or(matured) AS matured
  FROM sequenced
  WHERE event_name = 'withdraw'
    AND cycle_no > 0
  GROUP BY 1, 2, 3
),
positions AS (
  SELECT
    d.lock_period_seconds,
    d.amount,
    COALESCE(w.matured, false) AS matured,
    CASE WHEN w.deposit_id IS NULL THEN true ELSE false END AS active
  FROM deposits d
  LEFT JOIN withdrawals w
    ON w.environment = d.environment
   AND w.deposit_id = d.deposit_id
   AND w.cycle_no = d.cycle_no
),
periods AS (
  SELECT * FROM (
    VALUES
      (604800, '7 days', 1),
      (7776000, '3 months', 2),
      (15552000, '6 months', 3)
  ) AS t(lock_period_seconds, lock_period, sort_order)
),
statuses AS (
  SELECT * FROM (
    VALUES
      ('Active', 1),
      ('Matured', 2)
  ) AS t(status, status_order)
)
SELECT
  p.lock_period,
  s.status,
  COUNT(pos.amount) AS deposits,
  COALESCE(SUM(pos.amount), 0) AS amount
FROM periods p
CROSS JOIN statuses s
LEFT JOIN positions pos
  ON pos.lock_period_seconds = p.lock_period_seconds
 AND (
   (s.status = 'Active' AND pos.active)
   OR
   (s.status = 'Matured' AND pos.matured)
 )
GROUP BY p.lock_period, p.sort_order, s.status, s.status_order
ORDER BY p.sort_order, s.status_order;

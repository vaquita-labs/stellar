-- ============================================================================
-- Vaquita Accounts Dashboard
--
-- Tables:
--   dune.vaquitaprotocol0178.dataset_vaquita_accounts
--   dune.vaquitaprotocol0178.vaquita_pool_events
--
-- Upload a sanitized accounts table. Do not upload raw Name or Email to a
-- public Dune table. Expected `vaquita_accounts` columns:
--   user_id
--   wallet_public_key
--   providers
--   status
--   joined
--   last_login
--
-- `vaquita_pool_events` is the enriched pool event table used by the main
-- Vaquita Dune dashboard.
--
-- MULTI-ENVIRONMENT: pool queries filter by `{{environment}}`, default "dev".
-- To show all environments, set `{{environment}}` to "%".
-- ============================================================================


-- ============================================================
-- PANEL 1 — ACCOUNT OVERVIEW                       Visualization: Table
-- ============================================================
WITH accounts AS (
  SELECT
    user_id,
    NULLIF(TRIM(wallet_public_key), '') AS wallet_public_key,
    NULLIF(TRIM(providers), '') AS providers,
    status,
    TRY(CAST(from_iso8601_timestamp(joined) AS timestamp)) AS joined,
    TRY(CAST(from_iso8601_timestamp(last_login) AS timestamp)) AS last_login
  FROM dune.vaquitaprotocol0178.dataset_vaquita_accounts
)
SELECT 'Total accounts' AS metric, COUNT(*) AS value
FROM accounts

UNION ALL

SELECT 'Wallet-linked accounts' AS metric, COUNT(*) AS value
FROM accounts
WHERE wallet_public_key IS NOT NULL

UNION ALL

SELECT 'Accounts without wallet' AS metric, COUNT(*) AS value
FROM accounts
WHERE wallet_public_key IS NULL

UNION ALL

SELECT 'Active accounts' AS metric, COUNT(*) AS value
FROM accounts
WHERE status = 'Active'

UNION ALL

SELECT 'Accounts with last login' AS metric, COUNT(*) AS value
FROM accounts
WHERE last_login IS NOT NULL;


-- ============================================================
-- PANEL 2 — SIGNUPS BY PROVIDER OVER TIME          Visualization: Stacked bar or area
--   x = day, y = new_accounts, series = provider_segment
-- ============================================================
WITH accounts AS (
  SELECT
    user_id,
    TRY(CAST(from_iso8601_timestamp(joined) AS timestamp)) AS joined,
    CASE
      WHEN providers IS NULL OR TRIM(providers) = '' THEN 'Unknown'
      WHEN strpos(providers, ';') > 0 THEN 'Multi-provider'
      WHEN providers = 'GOOGLE' THEN 'Google'
      WHEN providers = 'EMAIL' THEN 'Email'
      WHEN providers = 'WALLET' THEN 'Wallet only'
      WHEN providers = 'GITHUB' THEN 'GitHub'
      ELSE providers
    END AS provider_segment
  FROM dune.vaquitaprotocol0178.dataset_vaquita_accounts
)
SELECT
  date_trunc('day', joined) AS day,
  provider_segment,
  COUNT(*) AS new_accounts
FROM accounts
WHERE joined IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;


-- ============================================================
-- PANEL 3 — PROVIDER FUNNEL                         Visualization: Grouped bar
--   x = provider_segment, y = users, series = funnel_step
-- ============================================================
WITH accounts AS (
  SELECT
    user_id,
    NULLIF(TRIM(wallet_public_key), '') AS wallet_public_key,
    CASE
      WHEN providers IS NULL OR TRIM(providers) = '' THEN 'Unknown'
      WHEN strpos(providers, ';') > 0 THEN 'Multi-provider'
      WHEN providers = 'GOOGLE' THEN 'Google'
      WHEN providers = 'EMAIL' THEN 'Email'
      WHEN providers = 'WALLET' THEN 'Wallet only'
      WHEN providers = 'GITHUB' THEN 'GitHub'
      ELSE providers
    END AS provider_segment
  FROM dune.vaquitaprotocol0178.dataset_vaquita_accounts
),
depositors AS (
  SELECT DISTINCT caller AS wallet_public_key
  FROM (
    SELECT
      *,
      row_number() OVER (
        PARTITION BY event_id
        ORDER BY
          CASE WHEN lock_period IS NULL THEN 1 ELSE 0 END,
          CASE WHEN matured IS NULL THEN 1 ELSE 0 END,
          ledger,
          ledger_closed_at,
          environment,
          event_name,
          caller,
          deposit_id
      ) AS rn
    FROM dune.vaquitaprotocol0178.vaquita_pool_events
    WHERE environment LIKE COALESCE(NULLIF('{{environment}}', ''), '%')
  )
  WHERE rn = 1
    AND event_name = 'deposit'
    AND caller <> ''
),
funnel AS (
  SELECT provider_segment, 'Accounts' AS funnel_step, COUNT(*) AS users
  FROM accounts
  GROUP BY 1

  UNION ALL

  SELECT provider_segment, 'Wallet linked' AS funnel_step, COUNT(*) AS users
  FROM accounts
  WHERE wallet_public_key IS NOT NULL
  GROUP BY 1

  UNION ALL

  SELECT a.provider_segment, 'Deposited' AS funnel_step, COUNT(*) AS users
  FROM accounts a
  INNER JOIN depositors d
    ON d.wallet_public_key = a.wallet_public_key
  GROUP BY 1
)
SELECT provider_segment, funnel_step, users
FROM funnel
ORDER BY provider_segment, CASE funnel_step
  WHEN 'Accounts' THEN 1
  WHEN 'Wallet linked' THEN 2
  WHEN 'Deposited' THEN 3
  ELSE 4
END;


-- ============================================================
-- PANEL 4 — DEPOSIT STATUS BY PROVIDER              Visualization: Grouped bar
--   x = provider_segment, y = deposits, series = deposit_status
-- ============================================================
WITH accounts AS (
  SELECT
    NULLIF(TRIM(wallet_public_key), '') AS wallet_public_key,
    CASE
      WHEN providers IS NULL OR TRIM(providers) = '' THEN 'Unknown'
      WHEN strpos(providers, ';') > 0 THEN 'Multi-provider'
      WHEN providers = 'GOOGLE' THEN 'Google'
      WHEN providers = 'EMAIL' THEN 'Email'
      WHEN providers = 'WALLET' THEN 'Wallet only'
      WHEN providers = 'GITHUB' THEN 'GitHub'
      ELSE providers
    END AS provider_segment
  FROM dune.vaquitaprotocol0178.dataset_vaquita_accounts
),
ev AS (
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
    SELECT
      *,
      row_number() OVER (
        PARTITION BY event_id
        ORDER BY
          CASE WHEN lock_period IS NULL THEN 1 ELSE 0 END,
          CASE WHEN matured IS NULL THEN 1 ELSE 0 END,
          ledger,
          ledger_closed_at,
          environment,
          event_name,
          caller,
          deposit_id
      ) AS rn
    FROM dune.vaquitaprotocol0178.vaquita_pool_events
    WHERE environment LIKE COALESCE(NULLIF('{{environment}}', ''), '%')
  )
  WHERE rn = 1
),
sequenced AS (
  SELECT
    *,
    SUM(CASE WHEN event_name = 'deposit' THEN 1 ELSE 0 END) OVER (
      PARTITION BY environment, caller, deposit_id
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
    caller,
    deposit_id,
    cycle_no,
    amount
  FROM sequenced
  WHERE event_name = 'deposit'
),
withdrawals AS (
  SELECT
    environment,
    caller,
    deposit_id,
    cycle_no,
    bool_or(matured) AS matured
  FROM sequenced
  WHERE event_name = 'withdraw'
    AND cycle_no > 0
  GROUP BY 1, 2, 3, 4
),
positions AS (
  SELECT
    d.caller AS wallet_public_key,
    d.amount,
    CASE
      WHEN w.deposit_id IS NULL THEN 'Active'
      WHEN COALESCE(w.matured, false) THEN 'Matured withdrawn'
      ELSE 'Early withdrawn'
    END AS deposit_status
  FROM deposits d
  LEFT JOIN withdrawals w
    ON w.environment = d.environment
   AND w.caller = d.caller
   AND w.deposit_id = d.deposit_id
   AND w.cycle_no = d.cycle_no
)
SELECT
  COALESCE(a.provider_segment, 'Unknown account source') AS provider_segment,
  p.deposit_status,
  COUNT(*) AS deposits,
  COALESCE(SUM(p.amount), 0) AS amount
FROM positions p
LEFT JOIN accounts a
  ON a.wallet_public_key = p.wallet_public_key
GROUP BY 1, 2
ORDER BY 1, 2;


-- ============================================================
-- PANEL 5 — LOCK PERIOD PREFERENCE BY PROVIDER      Visualization: Stacked bar
--   x = lock_period, y = deposits, series = provider_segment
-- ============================================================
WITH accounts AS (
  SELECT
    NULLIF(TRIM(wallet_public_key), '') AS wallet_public_key,
    CASE
      WHEN providers IS NULL OR TRIM(providers) = '' THEN 'Unknown'
      WHEN strpos(providers, ';') > 0 THEN 'Multi-provider'
      WHEN providers = 'GOOGLE' THEN 'Google'
      WHEN providers = 'EMAIL' THEN 'Email'
      WHEN providers = 'WALLET' THEN 'Wallet only'
      WHEN providers = 'GITHUB' THEN 'GitHub'
      ELSE providers
    END AS provider_segment
  FROM dune.vaquitaprotocol0178.dataset_vaquita_accounts
),
deposits AS (
  SELECT
    caller AS wallet_public_key,
    TRY_CAST(lock_period AS bigint) AS lock_period_seconds,
    amount
  FROM (
    SELECT
      *,
      row_number() OVER (
        PARTITION BY event_id
        ORDER BY
          CASE WHEN lock_period IS NULL THEN 1 ELSE 0 END,
          CASE WHEN matured IS NULL THEN 1 ELSE 0 END,
          ledger,
          ledger_closed_at,
          environment,
          event_name,
          caller,
          deposit_id
      ) AS rn
    FROM dune.vaquitaprotocol0178.vaquita_pool_events
    WHERE environment LIKE COALESCE(NULLIF('{{environment}}', ''), '%')
  )
  WHERE rn = 1
    AND event_name = 'deposit'
    AND caller <> ''
),
periods AS (
  SELECT * FROM (
    VALUES
      (604800, '7 days', 1),
      (7776000, '3 months', 2),
      (15552000, '6 months', 3)
  ) AS t(lock_period_seconds, lock_period, sort_order)
)
SELECT
  p.lock_period,
  COALESCE(a.provider_segment, 'Unknown account source') AS provider_segment,
  COUNT(d.wallet_public_key) AS deposits,
  COALESCE(SUM(d.amount), 0) AS amount
FROM periods p
LEFT JOIN deposits d
  ON d.lock_period_seconds = p.lock_period_seconds
LEFT JOIN accounts a
  ON a.wallet_public_key = d.wallet_public_key
GROUP BY p.lock_period, p.sort_order, COALESCE(a.provider_segment, 'Unknown account source')
ORDER BY p.sort_order, provider_segment;


-- ============================================================
-- PANEL 6 — LOGIN FRESHNESS                         Visualization: Bar chart
--   x = login_freshness, y = accounts
--
-- Uses the latest login in the uploaded accounts table as the cutoff so the
-- same uploaded CSV returns stable buckets.
-- ============================================================
WITH accounts AS (
  SELECT
    user_id,
    TRY(CAST(from_iso8601_timestamp(last_login) AS timestamp)) AS last_login
  FROM dune.vaquitaprotocol0178.dataset_vaquita_accounts
),
as_of AS (
  SELECT max(last_login) AS cutoff_time
  FROM accounts
),
bucketed AS (
  SELECT
    CASE
      WHEN a.last_login IS NULL THEN 'Never logged in'
      WHEN date_diff('hour', a.last_login, s.cutoff_time) <= 24 THEN '<= 1 day'
      WHEN date_diff('day', a.last_login, s.cutoff_time) <= 7 THEN '1-7 days'
      WHEN date_diff('day', a.last_login, s.cutoff_time) <= 30 THEN '8-30 days'
      ELSE '> 30 days'
    END AS login_freshness,
    CASE
      WHEN a.last_login IS NULL THEN 5
      WHEN date_diff('hour', a.last_login, s.cutoff_time) <= 24 THEN 1
      WHEN date_diff('day', a.last_login, s.cutoff_time) <= 7 THEN 2
      WHEN date_diff('day', a.last_login, s.cutoff_time) <= 30 THEN 3
      ELSE 4
    END AS sort_order
  FROM accounts a
  CROSS JOIN as_of s
)
SELECT login_freshness, COUNT(*) AS accounts
FROM bucketed
GROUP BY login_freshness, sort_order
ORDER BY sort_order;


-- ============================================================
-- PANEL 7 — TIME FROM SIGNUP TO FIRST DEPOSIT       Visualization: Table
-- ============================================================
WITH accounts AS (
  SELECT
    NULLIF(TRIM(wallet_public_key), '') AS wallet_public_key,
    TRY(CAST(from_iso8601_timestamp(joined) AS timestamp)) AS joined,
    CASE
      WHEN providers IS NULL OR TRIM(providers) = '' THEN 'Unknown'
      WHEN strpos(providers, ';') > 0 THEN 'Multi-provider'
      WHEN providers = 'GOOGLE' THEN 'Google'
      WHEN providers = 'EMAIL' THEN 'Email'
      WHEN providers = 'WALLET' THEN 'Wallet only'
      WHEN providers = 'GITHUB' THEN 'GitHub'
      ELSE providers
    END AS provider_segment
  FROM dune.vaquitaprotocol0178.dataset_vaquita_accounts
),
first_deposit AS (
  SELECT
    caller AS wallet_public_key,
    min(ledger_closed_at) AS first_deposit_at
  FROM (
    SELECT
      *,
      row_number() OVER (
        PARTITION BY event_id
        ORDER BY
          CASE WHEN lock_period IS NULL THEN 1 ELSE 0 END,
          CASE WHEN matured IS NULL THEN 1 ELSE 0 END,
          ledger,
          ledger_closed_at,
          environment,
          event_name,
          caller,
          deposit_id
      ) AS rn
    FROM dune.vaquitaprotocol0178.vaquita_pool_events
    WHERE environment LIKE COALESCE(NULLIF('{{environment}}', ''), '%')
  )
  WHERE rn = 1
    AND event_name = 'deposit'
    AND caller <> ''
  GROUP BY 1
),
converted AS (
  SELECT
    a.provider_segment,
    date_diff('hour', a.joined, f.first_deposit_at) AS hours_to_first_deposit
  FROM accounts a
  INNER JOIN first_deposit f
    ON f.wallet_public_key = a.wallet_public_key
  WHERE a.joined IS NOT NULL
    AND f.first_deposit_at >= a.joined
)
SELECT
  provider_segment,
  COUNT(*) AS converted_accounts,
  approx_percentile(hours_to_first_deposit, 0.5) AS median_hours_to_first_deposit,
  approx_percentile(hours_to_first_deposit, 0.9) AS p90_hours_to_first_deposit
FROM converted
GROUP BY 1
ORDER BY converted_accounts DESC;


-- ============================================================
-- PANEL 8 — RE-ENGAGEMENT SEGMENTS                  Visualization: Table
-- ============================================================
WITH accounts AS (
  SELECT
    user_id,
    NULLIF(TRIM(wallet_public_key), '') AS wallet_public_key,
    TRY(CAST(from_iso8601_timestamp(last_login) AS timestamp)) AS last_login
  FROM dune.vaquitaprotocol0178.dataset_vaquita_accounts
),
as_of AS (
  SELECT max(last_login) AS cutoff_time
  FROM accounts
),
depositors AS (
  SELECT DISTINCT caller AS wallet_public_key
  FROM (
    SELECT
      *,
      row_number() OVER (
        PARTITION BY event_id
        ORDER BY
          CASE WHEN lock_period IS NULL THEN 1 ELSE 0 END,
          CASE WHEN matured IS NULL THEN 1 ELSE 0 END,
          ledger,
          ledger_closed_at,
          environment,
          event_name,
          caller,
          deposit_id
      ) AS rn
    FROM dune.vaquitaprotocol0178.vaquita_pool_events
    WHERE environment LIKE COALESCE(NULLIF('{{environment}}', ''), '%')
  )
  WHERE rn = 1
    AND event_name = 'deposit'
    AND caller <> ''
),
segments AS (
  SELECT
    CASE
      WHEN a.wallet_public_key IS NULL THEN 'No wallet linked'
      WHEN d.wallet_public_key IS NULL THEN 'Wallet linked, no deposit'
      WHEN a.last_login IS NULL THEN 'Deposited, no login timestamp'
      WHEN date_diff('day', a.last_login, s.cutoff_time) > 7 THEN 'Deposited, inactive > 7d'
      ELSE 'Deposited, recently active'
    END AS segment
  FROM accounts a
  CROSS JOIN as_of s
  LEFT JOIN depositors d
    ON d.wallet_public_key = a.wallet_public_key
)
SELECT segment, COUNT(*) AS accounts
FROM segments
GROUP BY 1
ORDER BY accounts DESC;

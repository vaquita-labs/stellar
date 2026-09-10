-- `deposit_coins_daily_cap` — ceiling on the coins a wallet can earn from
-- depositing in one UTC calendar day, summed across both savings products.
--
-- Depositing has never granted coins: they came only from the daily check-in
-- (1/day) and from claiming a badge (25-250). The grant this cap bounds is 1
-- coin per whole USDC deposited, minimum 1 USDC. Against real production data
-- the median deposit is $1.10 and the largest ever is $250, so without a cap one
-- transaction would out-pay a Diamond badge.
--
-- On the singleton `config` row and edited from the admin Config page, for the
-- same reason `daily_gold_coins` is: it is an economy dial and it will be tuned.
-- NOT NULL with a default so the existing row backfills cleanly.

ALTER TABLE config
  ADD COLUMN IF NOT EXISTS deposit_coins_daily_cap integer NOT NULL DEFAULT 100;

COMMENT ON COLUMN config.deposit_coins_daily_cap IS
  'Max coins earnable from deposits per UTC day, across locked and flexible. Grant is floor(amount USDC), minimum 1 USDC.';

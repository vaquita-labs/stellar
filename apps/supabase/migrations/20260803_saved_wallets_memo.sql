-- saved_wallets.memo: optional destination memo/tag for the withdraw flow.
--
-- Some exchanges (and other custodial destinations) credit a deposit only when
-- the transfer carries a memo/tag that identifies the user's account. The memo
-- belongs to the saved address, not to a single withdrawal, so it lives next to
-- `address`: save it once and it travels with every payout to that wallet.
--
-- Nullable on purpose — most self-custody wallets need no memo, so the field is
-- opt-in in the UI. VARCHAR(64) leaves room for both Stellar text memos and the
-- longer numeric ids some exchanges hand out.

ALTER TABLE "saved_wallets"
  ADD COLUMN IF NOT EXISTS "memo" varchar(64);

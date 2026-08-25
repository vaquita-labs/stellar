-- legal_acceptances: append-only record of every time a user accepted the
-- Privacy Policy, Terms of Service and Risk Disclosure bundle.
--
-- Append-only on purpose. A boolean flag on `profiles` would be overwritten the
-- next time the policy is revised, destroying the evidence of what the user
-- agreed to the first time round. Each acceptance is its own immutable row, so
-- "which version did this wallet accept, and when" stays answerable forever —
-- that record is what makes the eligibility, risk and liability clauses in the
-- Terms enforceable.
--
-- wallet_address is denormalized from profiles so the record survives a profile
-- soft-delete (and would survive a hard delete): the acceptance is evidence
-- about a wallet, not a piece of profile state. No FK on profile_id — relations
-- are enforced at the application layer here, like every other table.
--
-- accepted_documents pins the individual document versions ({"privacy":"…",
-- "terms":"…","risk":"…"}) inside the bundle version, so a future revision that
-- touches only one document is still reconstructable.
--
-- jurisdiction_attested is stored separately from the policy acceptance because
-- it is a distinct representation by the user (18+, not resident in a sanctioned
-- or restricted jurisdiction, not on a sanctions list) and needs to be provable
-- on its own.
--
-- No IP address is recorded. The API deliberately drops IPs from its logs
-- (apps/api/src/lib/logger.ts), and collecting them here purely to infer
-- jurisdiction would expand the privacy footprint the policy has to disclose.
-- country_code holds the coarse two-letter code only when edge geo-detection is
-- configured upstream; NULL otherwise.

CREATE TABLE IF NOT EXISTS "legal_acceptances" (
  "id"                    serial       PRIMARY KEY,
  "profile_id"            integer      NOT NULL,
  "wallet_address"        varchar(100) NOT NULL,
  "policy_version"        varchar(20)  NOT NULL,
  "accepted_documents"    jsonb        NOT NULL DEFAULT '{}'::jsonb,
  "jurisdiction_attested" boolean      NOT NULL DEFAULT false,
  "country_code"          char(2),
  "user_agent"            varchar(300),
  "locale"                varchar(10),
  "accepted_at"           timestamptz(6) NOT NULL DEFAULT now(),
  "created_at"            timestamptz(6) NOT NULL DEFAULT now()
);

-- The gate reads "latest acceptance for this profile" on every profile load.
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_profile
  ON "legal_acceptances" ("profile_id", "accepted_at" DESC);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_wallet
  ON "legal_acceptances" ("wallet_address");

-- config.legal_policy_version: the bundle version users must currently have
-- accepted. Lives in the singleton config (like game_day_length_ms and
-- daily_gold_coins) so a material policy revision can re-gate every user by
-- bumping one row, with no frontend deploy. The gate compares by string
-- equality, not ordering — any change re-gates.
ALTER TABLE "config"
  ADD COLUMN IF NOT EXISTS "legal_policy_version" varchar(20) NOT NULL DEFAULT '2026-08-25';

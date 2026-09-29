# Database migrations — per-environment status and apply notes

The rules (no tracking table, `db:push` never on prod, hand-edit the schema) are in `CLAUDE.md` →
**Database migrations**. This file is the log: what has been applied where, and how.

**Known-pending as of 2026-09-29:**

| Migration | dev | staging | prod |
|-----------|-----|---------|------|
| `20260929_deposit_from_app.sql` | ✅ | ✅ | ✅ |
| `20260911_vaquitatag.sql` | ✅ | ✅ | ✅ |
| `20260910_wallet_transfers.sql` | ✅ | ✅ | ✅ |
| `20260910_pwa_installs.sql` | ✅ | ✅ | ✅ |
| `20260910_wallet_balance_history.sql` | ✅ | ✅ | ✅ |
| `20260910_config_deposit_coins.sql` | ✅ | ✅ | ✅ |
| `20260910_vault_flows.sql` | ✅ | ✅ | ✅ |
| `20260908_profile_home_tour.sql` | ✅ | ✅ | ✅ |
| `20260908_release_notes_translations.sql` | ✅ | ✅ | ✅ |
| `20260907_release_notes.sql` | ✅ | ✅ | ✅ |
| `20260907_bridge_oneclick.sql` | ✅ | ✅ | ✅ |
| `20260906_feedback_moderation.sql` | ✅ | ✅ | ✅ |
| `20260906_feedback_attachments_votes.sql` | ✅ | ✅ | ✅ |
| `20260905_vault_tvl_snapshots.sql` | ✅ | ✅ | ✅ |
| `20260905_feedback_posts.sql` | ✅ | ✅ | ✅ |
| `20260905_campaigns.sql` | ✅ | ✅ | ✅ |
| `20260903_saved_bank_accounts.sql` | ✅ | ✅ | ✅ |
| `20260825_schema_parity_constraints.sql` | ✅ | ? | ❌ |
| `20260820_vault_apy_snapshots.sql` | ❌ | ❌ | ❌ |

(`?` = not verified — re-check with a diff script in `apps/api/tmp/` before trusting the row.)

Apply `20260929_deposit_from_app.sql` with `apps/api/tmp/2026-09-29-apply-deposit-from-app.ts`
(same `check` / `apply` shape; it also re-applies `packages/db/sql/deposit_intents_checks.sql`).
Applied to dev, staging and prod on 2026-09-29. It adds `config.deposit_platforms` (the "Deposit from another app"
catalog, seeded with Binance and Meru enabled, Takenos and Wallbit disabled until the bridge takes
Polygon USDT) and the `deposit_intents` table behind the waiting card on Home. **Apply before the
API deploys anywhere new**: `prisma.config.findFirst()` names every column in the model, so a
missing `deposit_platforms` fails the boot config read with P2022, which takes the whole app down,
not just this feature. The seed only fills a column that is still `'[]'`, so re-running never
overwrites an edit.

Apply `20260911_vaquitatag.sql` with `apps/api/tmp/2026-09-11-apply-vaquitatag.ts` (same
`check` / `apply` shape; it also re-applies `packages/db/sql/profiles_nickname_format.sql`).
Applied to dev, staging and prod on 2026-09-11. It does four things in one transaction: widens
`referral_code` to `varchar(50)`, strips non-alphanumerics out of every nickname, points every
named profile's `referral_code` at its nickname, and tightens the format CHECK to
`^[a-z0-9]{3,32}$`. **The widening is load-bearing** — a grandfathered 31-character tag does not
fit the old `varchar(12)`, so the third step fails without it. Run
`apps/api/tmp/2026-09-11-vaquitatag-preflight.ts` (read-only) against an environment first: it
reports strip collisions, nicknames colliding with another profile's `referral_code`, and campaign
codes equal to a nickname case-insensitively. All three were zero everywhere on 2026-09-11.
The API writes `referral_code = nickname` on every tag save, so apply before deploying the API
anywhere new.

Apply `20260910_wallet_transfers.sql` with `apps/api/tmp/2026-09-10-apply-wallet-transfers.ts`
(same `check` / `apply` shape; it also re-applies `packages/db/sql/wallet_transfers_enums.sql`).
Applied to dev, staging and prod on 2026-09-10. It is the record of payments out of a user's
wallet — both a send to another Vaquita user and a send to an outside address, which on chain are
one operation. **Apply before the API deploys anywhere new**: the write path 500s without the
table, while the metrics dashboard probes it with `to_regclass` and merely hides a panel.
`destination_kind` is resolved server-side against `profiles.wallet_address` at insert and stored,
never derived at read — the question is whether the destination was a Vaquita user *when it
happened*, and it is what decides which volume total the row counts against.
`apps/api/tmp/2026-09-10-wallet-transfers-constraints.ts` proves the four CHECKs and the hash
unique index reject what they claim to, inside a rolled-back transaction.

Apply `20260910_pwa_installs.sql` with `apps/api/tmp/2026-09-10-apply-pwa-installs.ts` (same
`check` / `apply` shape; it also re-applies `packages/db/sql/pwa_installs_enums.sql`). Applied to
dev, staging and prod on 2026-09-10. The metrics Engagement page probes the table with
`to_regclass`, so a missing one hides the panel instead of 500ing; the API route, however, would
fail on write, so apply before deploying the API anywhere new.

Apply the three 2026-09-10 ones with `apps/api/tmp/2026-09-10-apply-vault-flows.ts` (same
`check` / `apply` shape; it also re-applies `packages/db/sql/vault_flows_enums.sql`, the CHECKs a
later `prisma db push` would drop). All three were applied to dev, staging and prod on
2026-09-10. Two of them are load-bearing for code already merged: `refreshWalletBalances` writes
the balance and its `wallet_balance_history` row in one transaction, so an environment without
that table fails every wallet read; and the metrics dashboard probes `vault_flows` with
`to_regclass` precisely so a missing one degrades to locked-only instead of 500ing.

Apply `20260908_profile_home_tour.sql` with `apps/api/tmp/2026-09-10-apply-profile-home-tour.ts`
(same `check` / `apply` shape). It was applied to dev and prod on 2026-09-08 and **missed on
staging until 2026-09-10**, which is worth remembering as the shape of the failure: the column is
read by one feature, but `prisma.profile.upsert` names every column in the model, so a single
missing one fails the whole call with P2022. Staging's invite screen 500ed on a referral summary
that selects four fields, none of them this one.

The translations one is applied everywhere (2026-09-08) via
`apps/api/tmp/2026-09-08-apply-release-notes-translations.ts` (same `check` / `apply` shape).
It is purely additive — one `translations` jsonb column plus a `jsonb_typeof = 'object'` CHECK —
but the release-notes service selects that column, so any environment without it would 500 on
`/release-notes/latest`; apply before deploying the API anywhere new.

Apply the two 2026-09-07 ones with `apps/api/tmp/2026-09-07-apply-release-notes-bridge.ts`
(same `check` / `apply` shape). It also re-applies the matching `packages/db/sql/` CHECKs.
Note that `20260907_bridge_oneclick.sql` **drops columns** (the CCTP protocol fields and the
old worker's queue bookkeeping) — none hold user data, but confirm the printed host first.

Apply the moderation one with `apps/api/tmp/2026-09-06-apply-feedback-moderation.ts`
(same `check` / `apply` shape). Apply the 2026-09-06 and `vault_tvl_snapshots` ones with
`apps/api/tmp/2026-09-06-apply-attachments-votes-tvl.ts` (same `check` / `apply` shape;
`20260906_feedback_attachments_votes.sql` needs `20260905_feedback_posts.sql` applied first).

Apply the two 2026-09-05 ones with `apps/api/tmp/2026-09-05-apply-feedback-campaigns.ts`
(`NODE_ENV=development pnpm exec tsx tmp/2026-09-05-apply-feedback-campaigns.ts check .env.staging`
first — it prints env/host/database/user before writing anything, and `apply` is idempotent).

Apply the saved-bank one with `apps/api/tmp/2026-09-03-apply-saved-banks-migration.ts`
(`NODE_ENV=development pnpm exec tsx tmp/2026-09-03-apply-saved-banks-migration.ts apply .env.staging`);
it prints host + database before writing so you can confirm the target. After pulling a schema
change, run `pnpm db:generate` — the `SavedBankAccount` model will not exist on the client
otherwise. `packages/db/sql/saved_bank_accounts_label_unique.sql` holds that partial unique index
because `prisma db push` would drop it.

# Database schema (public schema, Supabase Postgres)

Indexed from the live database. Row counts are `pg_class` estimates (approximate; `-1` means never analyzed), not exact. PK = primary key; `*_id` columns are implied foreign keys (no FK constraints exist in the schema — relations are enforced at the application layer).

**Core financial (pool deposits/withdrawals)**
- `tokens` (~2 rows) — `id` PK, `symbol`, `contract_address`, `vaquita_contract_address`, `defindex_vault_contract_address`, `lock_periods[]`, `is_native`/`is_gas`/`is_supported`. One row per supported token per network; maps to `TokenNetwork`.
- `deposits` (~163 rows) — `id` PK, `wallet_address`, `token_id` → tokens, `amount`, `status`, `transaction_hash`, `deposit_id_hex` (on-chain `deposit_id`), `lock_period`, `vaquita_contract_address`, `confirmed_at`.
- `withdrawals` (~0, unanalyzed) — `id` PK, `deposit_id` → deposits, `status`, `transaction_hash`, `transfer_amount`, `interest`, `reward`, `confirmed_at`.
- `config` (~1 row) — `id` PK, `network_name`, `origins[]`, `network_passphrase`, `badges_contract_address`, `currencies`/`languages` (jsonb), `cycle_duration_ms`, `daily_gold_coins`, `daily_checkin_experience`, `reconciliation_state` (jsonb — reconciliation cursor state), `game_day_length_ms`, `legal_policy_version`. Singleton network config row.
- `wallet_balances` — `id` PK (uuid), `wallet_address`, `token_id` → tokens, `blend_usdc`, `vault_usdc`, `vaquita_positions` (jsonb, locked deposits by period), `scraped_at`, `last_error`. Unique on (`wallet_address`, `token_id`). A snapshot, never live: written only by `refreshWalletBalances`, so always show `scraped_at` beside the numbers. **Never `SUM(vault_usdc)` across the whole table** — rows survive a token being retired (production still carries 45 rows for the unsupported token 1, on the same vault as token 2, from 2026-08-05), so an unfiltered sum double-counts. Filter by the supported `token_id`.
- `vault_apy_snapshots` — PK (`network`, `vault_address`), `apy`, `fetched_at`. Last-known-good DeFindex APY; derived cache, safe to truncate. **Its migration has never been applied to any environment** — until it is, `readVaultApySnapshot` swallows the error and APY caching is in-memory only.

**Legal**
- `legal_acceptances` — `id` PK, `profile_id` → profiles, `wallet_address` (denormalized so the record outlives the profile), `policy_version`, `accepted_documents` (jsonb `{privacy, terms, risk}`), `jurisdiction_attested`, `country_code`, `user_agent`, `locale`, `accepted_at`. **Append-only** — one row per acceptance, never updated in place; that history is what makes the Terms enforceable.

**Badges**
- `achievements` (~16 rows) — `id` PK, `key` (badge type identifier), `name`, `description`, `tier`, `coin_reward`, `hidden`, `refresh_policy` (`auto`|`manual`), `cycle_scoped`, `unlock_type`, `rule` (jsonb), `icon`, `accent`, `display_order`, `enabled`.
- `badge_claims` (~68 rows) — `id` PK (uuid), `wallet_address`, `badge_type`, `cycle_id`, `expires_at`, `signature` (backend Ed25519 signature for on-chain mint), `transaction_hash`, `superseded_at`, `confirmed_at`.
- `profiles_achievements` (~40 rows) — `id` PK, `profile_id` → profiles, `achievement_id` → achievements, `claimed_at`. Source of truth for claim eligibility.
- `profiles_achievements_unlocks` (~79 rows) — `id` PK, `profile_id` → profiles, `achievement_id` → achievements, `unlocked_at`. Unlock event distinct from claim.
- `rewards` (~0, unanalyzed) — `id` PK, `key`, `name`. Reward type catalog.
- `profiles_rewards` (~290 rows) — `id` PK, `profile_id` → profiles, `reward_id` → rewards, `amount`, `reason`. Ledger of in-app reward/coin grants.

**Social / profile**
- `profiles` (~197 live rows in production as of 2026-09-07) — `id` PK, `wallet_address`, `nickname`, `full_name`, `email`, `onboarding_completed`, `tutorial_completed`, `crypto_savvy`, `avatar_key`/`avatar_url`, `currency`, `language`, `notification_preferences` (jsonb), `referral_code`, `referred_by_id` → profiles, `release_note_seen_id`.
- `follows` (~21 rows) — `id` PK, `follower_id` → profiles, `followee_id` → profiles.
- `follow_suggestion_dismissals` (~86 rows) — `id` PK, `viewer_id` → profiles, `dismissed_id` → profiles.
- `saved_wallets` (~0, unanalyzed) — `id` PK (uuid), `profile_id` → profiles, `label`, `address`, `network`. `network` must be a `toNetworkSlug` value the API accepts (`stellar`, `stellar-testnet`, `base`, …).
- `saved_bank_accounts` — `id` PK (uuid), `profile_id` → profiles, `label`, `country` (char(2)), `currency`, `rail`, `fields` (jsonb — provider-defined bank fields, **PII**), soft-deleted via `deleted_at`. Partial unique index on (`profile_id`, `country`, `label`) `WHERE deleted_at IS NULL`. Applied to every environment (see `docs/ops/database-migrations.md`).
- `notifications` (~195 rows) — `id` PK, `profile_id` → profiles, `type`, `message_key`, `params` (jsonb), `link`, `dedupe_key`, `read_at`.
- `map_likes` — `id` PK, `liker_id`/`owner_id` → profiles. Unique on the pair.
- `push_subscriptions` — `id` PK, `profile_id` → profiles, `endpoint` (unique), `p256dh`, `auth`, `user_agent`. Web-push (FCM/APNs) registrations.
- `push_campaigns` — `id` PK, `title`, `body`, `link`, `audience` (`all`|`usernames`), `usernames` (jsonb), `recipients`, `push_sent`/`push_failed`/`push_pruned`. Admin push send history.

**3D world / game state**
- `map_objects` (~0, unanalyzed) — `id` PK, `type`, `size`, `variants`, `prices`, `free_items`. Catalog of placeable world objects.
- `profiles_map_items` (~1203 rows) — `id` PK, `profile_id` → profiles, `type`, `variant`, `quantity`. Player inventory.
- `profiles_map_objects` (~79 rows) — `id` PK, `profile_id` → profiles (nullable), `objects` (json). Player world layout.

**Bridge (NEAR Intents 1Click)**
- `bridge_transfers` (~12 rows) — `id` PK (uuid), `direction`, `source_network`, `destination_network`, `source_wallet`, `destination_wallet`, `amount`/`amount_raw`/`amount_out`, `status` (the 1Click enum verbatim: `PENDING_DEPOSIT`/`PROCESSING`/`SUCCESS`/`REFUNDED`/`FAILED`/`INCOMPLETE_DEPOSIT`/`KNOWN_DEPOSIT_TX`), `deposit_address`, `deposit_memo`, `correlation_id`, `deadline`, `quote` (jsonb — the whole signed quote, kept for disputes), `source_tx_hash`, `destination_tx_hash`, `error_reason`. Status is pulled on read (`GET /transfers`), not by a worker.

**Release notes**
- `release_notes` — `id` serial PK, `title`, `body`, `translations` (jsonb), `published_at` (NULL = draft). Retained forever. **There is no `display_order` on this table** — that column belongs to `release_note_images`. `updated_at` is Prisma-level (`@updatedAt`), so a raw SQL insert must pass it explicitly.
- `release_note_images` — `id` uuid PK, `release_note_id` → release_notes (`ON DELETE CASCADE`), `content_type`, `byte_size`, `data` (bytea), `display_order`. Bytes in Postgres, like `feedback_attachments`.
- `profiles.release_note_seen_id` — the acknowledgement. One column, one write.

`GET /release-notes/latest` returns **two different things** and they are easy to conflate:
`note` = the newest *unseen* one for this profile, and it is the **trigger** — null means the
popup never opens, however many notes exist. `notes` = `getRecentReleaseNotes(3)`, the last
three published, newest first, which is what `ReleaseNotesModal` **stacks** behind dots once it
is open. So the app does show three, but only if three are published: as of 2026-09-22 prod had
1 published + 1 draft and dev had 0 rows, so neither environment can stack anything. Check with
`apps/api/tmp/2026-09-22-release-notes-stack.ts` (read-only; it also prints the
`update profiles set release_note_seen_id = null` needed to see the popup again).

All tables except join/lookup tables (`follows`, `follow_suggestion_dismissals`, `profiles_achievements*`, `profiles_map_items`) carry `created_at`/`updated_at`, and most also carry a nullable `deleted_at` (soft delete).

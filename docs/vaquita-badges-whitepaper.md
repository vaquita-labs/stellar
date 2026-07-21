# Vaquita Badges — Technical Whitepaper

**Version 0.2 — May 2026**
**Scope: `vaquita-badges` Soroban Smart Contract**

---

## 1. Abstract

Vaquita Badges is a soulbound NFT system built on Stellar/Soroban that rewards users for savings behavior on the Vaquita DeFi platform. It issues NFT badges to users based on leaderboard rankings and platform activity.

All badge categories use a single **admin-signed issuance model**: the backend authorizes every mint via an Ed25519 signature, keeping the system centralized and fully upgradeable without contract redeployment.

All badges are **soulbound**: non-transferable and non-burnable. The contract is built on the **OpenZeppelin Soroban NFT base** and deployed as a standalone `vaquita-badges` contract, separate from `vaquita-pool`.

Badge behavior (whether signatures are re-issued on demand and whether eligibility is cycle-scoped) is driven by `refresh_policy` and `cycle_scoped` columns on the `achievements` table rather than hardcoded category labels.

---

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Contract separation | New `vaquita-badges` contract | Independent deployment, security boundary; pool handles DeFi, badges handle identity |
| NFT base | OpenZeppelin Stellar Contracts | Audited ownership, balance tracking, token ID sequencing |
| Soulbound enforcement | Block transfer + block burn | Permanent identity guarantee; burn adds complexity with no clear v1 benefit |
| Metadata | Fully off-chain (API) | Contract stores only `token_id → owner`; `vaquita.fi/badge/{token_id}` serves display metadata |
| All categories eligibility | Admin-signed payload (Ed25519) | Centralized by design; fully upgradeable without redeployment |
| Cycle replay prevention | `cycle_id` in signed payload + claim key | Backend signature is bound to a specific month; cannot be replayed in another cycle |
| `vaquita-pool` modifications | None | All badge claims are pull-based via signed claims; pool stays unchanged |
| Badge behavior | DB columns `refresh_policy` + `cycle_scoped` | Replaces hardcoded category labels; extensible without code changes |
| Eligibility gate | `profiles_achievements` table | Single source of truth; eliminates dual-path re-derivation in the claim endpoint |
| Rank computation | Lazy on-demand lookup | No eager cycle-close cron; rank is computed from existing deposit/withdrawal data when requested |

---

## 3. Badge Catalogue

Badge behavior is governed by two columns on the `achievements` table:

| Column | Values | Meaning |
|--------|--------|---------|
| `refresh_policy` | `'auto'` \| `'manual'` | `auto` = backend re-signs on demand; `manual` = requires admin action |
| `cycle_scoped` | `boolean` | `true` for leaderboard badges whose eligibility is tied to a specific closed cycle |

### 3.1 Leaderboard Badges (`cycle_scoped = true`, `refresh_policy = 'auto'`)

| Badge key | Trigger | Rarity |
|-----------|---------|--------|
| `first-place` | Leaderboard rank #1 of the last closed cycle | Legendary |
| `second-place` | Rank #2 | Epic |
| `third-place` | Rank #3 | Rare |
| `top10` | Positions 1–10 of the last closed cycle | Uncommon |

Issued once per monthly cycle. Uses admin Ed25519 signature with `cycle_id = YYYYMM` to prevent cross-cycle replay. The signed `badge_type` string matches the achievement `key` exactly (e.g. `"first-place"`). Rank #1–3 wallets qualify for both their podium badge and the `top10` badge (two mints, two transactions).

Eligibility is verified lazily via `getLeaderboardRankForWallet` at claim time — there is no eager cycle-close job.

### 3.2 Personal Milestone Badges (`cycle_scoped = false`, `refresh_policy = 'auto'`)

Issued one-time per wallet. The backend monitors withdrawal events and platform signals to write rows into `profiles_achievements`; the claim endpoint checks that table.

| Badge key | Trigger | Rarity |
|-----------|---------|--------|
| `first-deposit` | Complete first deposit | Common |
| `rookie` | Complete first cycle | Common |
| `week-warrior` | Active 7 consecutive days | Uncommon |
| `savings-starter` | Reach 100 USDC saved | Common |
| `trio-saver` | 3 simultaneous active positions | Uncommon |
| `month-master` | Complete a full monthly cycle | Rare |
| `explorer` | Deposit across 2+ lock periods | Uncommon |
| `streak-master` | 30 consecutive days of activity | Rare |
| `whale` | 1 000 USDC in a single deposit | Rare |
| `savings-baron` | 10 000 USDC total saved | Epic |
| `century-saver` | 12 cycles completed without penalty | Epic |
| `beta-tester` | Registered during beta | Rare |
| `first-friend` | Referred first friend | Common |

> **Note:** The earlier milestone badges (`primera_vaquita`, `maratonista`, `trimestral`, `disciplinado`, `veterano`, `genesis_saver`, `mainnet_pioneer`) are not yet in the `achievements` catalog and are currently dormant. They cannot be claimed or minted until a future issue adds them.

### 3.3 Manual Badges (`cycle_scoped = false`, `refresh_policy = 'manual'`)

| Badge key | Trigger | Cap | Rarity |
|-----------|---------|-----|--------|
| `churrasquito-05-2026` | Special May 2026 event | variable | Epic |
| `secret-launch` | Internal launch event | variable | Epic |

New limited-edition badges are defined on-chain via `register_badge_type(badge_type, OneTimeOnly, Some(cap))` without redeployment. Manual badges require admin intervention to issue; the claim endpoint returns 403 with a support contact message instead of auto-signing.

---

## 4. Contract Architecture

### 4.1 Storage layout

```
Instance storage (contract-level config, low churn):
  DataKey::Admin                          → Address
  DataKey::PoolContract                   → Address   (for future cross-contract reads)
  DataKey::NextTokenId                    → u32
  DataKey::AdminSigningKey                → BytesN<32>  (Ed25519 public key)

Persistent storage (per-token and per-claim data, must survive TTL):
  DataKey::Claimed(
    badge_type: Symbol,   // matches achievements.key, e.g. "first-place"
    cycle_id: u32,        // YYYYMM for leaderboard badges; 0 for milestone/manual
    wallet: Address
  )                                        → ()          (double-claim prevention)
  DataKey::TokenOwner(token_id: u32)      → Address
  DataKey::EditionCap(edition_id: Symbol) → u32         (max mint for manual editions)
  DataKey::EditionCount(edition_id: Symbol) → u32       (minted so far)
```

### 4.2 Public interface

```rust
// --- Constructor (called once at deploy time) ---
fn __constructor(env, admin: Address, signing_key: BytesN<32>)

// --- Admin: badge type management ---
fn register_badge_type(env, badge_type: Symbol, policy: MintPolicy, edition_cap: Option<u32>)
fn set_mint_policy(env, badge_type: Symbol, policy: MintPolicy)
fn update_edition_cap(env, badge_type: Symbol, new_cap: u32)
fn update_signing_key(env, new_key: BytesN<32>)

// --- Admin: operational ---
fn pause(env)
fn unpause(env)
fn propose_upgrade(env, new_wasm_hash: BytesN<32>)
fn execute_upgrade(env)   // requires 48-hour timelock
fn cancel_upgrade(env)
fn lock_upgrades_forever(env)

// --- User: all badge types ---
fn mint_badge(
    env,
    wallet: Address,
    badge_type: Symbol,        // matches achievements.key
    cycle_id: u32,             // YYYYMM for PerCycle badges; 0 for OneTimeOnly
    expiry: u64,               // ledger timestamp after which sig is invalid
    signature: BytesN<64>,     // Ed25519 sig over sha256(contract_addr || wallet || badge_type || cycle_id_be4 || expiry_be8)
) -> Result<u32, Error>        // returns minted token_id

// --- View ---
fn owner_of(env, token_id: u32) -> Option<Address>
fn badge_type_of(env, token_id: u32) -> Option<Symbol>
fn has_claimed(env, wallet: Address, badge_type: Symbol, cycle_id: u32) -> bool
fn total_supply(env) -> u32
fn is_paused(env) -> bool
fn version(env) -> u32
```

### 4.3 Soulbound enforcement

```rust
// On the OpenZeppelin NFT base, override transfer:
fn transfer(env, from: Address, to: Address, token_id: u32) {
    panic!("SoulboundToken: transfers are disabled");
}
```

---

## 5. Issuance Flow

All badge types share the same on-chain flow. Eligibility verification is off-chain via the `profiles_achievements` table (for milestone badges) or the lazy rank lookup (for leaderboard badges).

```
1. [Event]    Eligibility is established:
                Leaderboard badges → wallet has a row in profiles_achievements for
                  first-place/second-place/third-place/top10 written by the claim route
                  after verifying rank via getLeaderboardRankForWallet
                Milestone badges   → badge-monitor writes profiles_achievements row
                                     when withdrawal/streak event is detected
                Manual badges      → admin writes profiles_achievements row manually

2. [User UX]  Taps "Mint Badge On-Chain" (single button):
                Step 1: POST /profile/.../achievements/:key/claim  (idempotent; 409 = already claimed, OK)
                Step 2: coin-burst animation plays
                Step 3: Continue → GET /claim/:network?type=:key&wallet=G...
                Step 4: Pollar adapter calls mint_badge on-chain
                Step 5: POST /claim/:network/confirm

3. [API]      GET /claim — signs if profiles_achievements row exists for wallet + badge_type:
                Leaderboard badges → also calls getLeaderboardRankForWallet to verify rank
                Manual badges      → returns 403 with support message (no auto-sign)

4. [Contract] mint_badge:
                verify Ed25519 sig → check expiry → check not already claimed →
                check edition cap (manual) → mint → mark claimed
```

**Signature verification (Soroban contract):**
```rust
// Hardened message: contract address is the first field — sig is contract-specific.
let mut msg = Bytes::new(&env);
msg.append(&env.current_contract_address().to_xdr(&env));
msg.append(&wallet.to_xdr(&env));
msg.append(&badge_type.to_xdr(&env));
msg.append(&Bytes::from_array(&env, &cycle_id.to_be_bytes()));
msg.append(&Bytes::from_array(&env, &expiry.to_be_bytes()));
let msg_hash = env.crypto().sha256(&msg);
let signing_key: BytesN<32> = env.storage().instance().get(&DataKey::AdminSigningKey).unwrap();
env.crypto().ed25519_verify(&signing_key, &msg_hash.into(), &signature);
// ed25519_verify panics on failure — no explicit error needed
```

**Replay prevention:**
```rust
let claim_key = DataKey::Claimed(badge_type.clone(), cycle_id, wallet.clone());
if env.storage().persistent().has(&claim_key) {
    return Err(Error::AlreadyClaimed);
}
// ... mint ...
env.storage().persistent().set(&claim_key, &());
```

---

## 6. Mint Policy

Every badge type registered on-chain has a `MintPolicy` value that governs how the double-mint guard is applied:

| Policy | `cycle_id` requirement | Double-mint scope |
|--------|------------------------|-------------------|
| `OneTimeOnly` | Must be `0` | A wallet can mint once, ever |
| `PerCycle` | Any `u32` | A wallet can mint once **per `cycle_id`** |

### 6.1 OneTimeOnly (default)

Unregistered badge types default to `OneTimeOnly`. The claim key stored on-chain is `Claimed(badge_type, 0, wallet)`. Passing `cycle_id ≠ 0` at mint time returns `InvalidCycleId` before signature verification. This guarantees that even a valid backend signature cannot be used to mint a second time in a later cycle.

Personal milestone badges (`cycle_scoped = false` in the DB) use `OneTimeOnly`. The backend signing service always passes `cycle_id = 0` for these.

### 6.2 PerCycle

Leaderboard badges (`cycle_scoped = true`) are registered with `PerCycle`. Each distinct `cycle_id` (e.g. `202605`, `202606`) produces a separate claim key `Claimed(badge_type, cycle_id, wallet)`. The same wallet can win first place in two consecutive months and mint two separate badges.

### 6.3 Policy registration and tightening

Admins register badge types with an explicit policy via `register_badge_type(badge_type, policy, edition_cap?)`. After registration, the policy can be **tightened** (`PerCycle → OneTimeOnly`) at any time. **Loosening** (`OneTimeOnly → PerCycle`) is blocked once any mint has been recorded for that badge type — a `PolicyFrozen` error is returned. This prevents retroactive expansion of the claim scope.

### 6.4 Verification from on-chain history

Badge holders can verify a badge type's policy from on-chain event history:
- Look for the most recent `BadgeTypeRegistered` or `MintPolicyUpdated` event for the badge type.
- The event includes the `policy` field as a `MintPolicy` enum value (`0 = OneTimeOnly`, `1 = PerCycle`).
- If no event exists, the policy is `OneTimeOnly` (the default).

---

## 7. Cycle IDs

Cycle IDs are `u32`. Two formats are supported:

| Format | Example | Used for |
|--------|---------|---------|
| `YYYYMM` (6-digit) | `202605` | Production monthly cycles |
| Unix epoch seconds (10-digit) | `1748304000` | Test fixed-duration cycles via `CYCLE_DURATION_MS` |

The backend sets the `cycle_id` when signing; the contract does not validate it against ledger time. Milestone and manual badges use `cycle_id = 0`.

**`CYCLE_DURATION_MS` env var** (API / leaderboard service): when set, overrides the default calendar-month cycle with a fixed duration in milliseconds. Intended for testing only (e.g. `900000` = 15 min). When unset, behavior is standard calendar months.

`getLastClosedCycleId()` returns the last fully-closed cycle in either format depending on whether `CYCLE_DURATION_MS` is set.

---

## 7. Off-Chain Infrastructure Required

| Component | Description |
|-----------|-------------|
| **Leaderboard query** | SQL query over `deposits` + `withdrawals` tables — see §9. No sampling job required. |
| **Lazy rank lookup** | `getLeaderboardRankForWallet(wallet, cycleId, networkId)` — called at claim time; no eager cycle-close cron. |
| **Badge monitor** | `evaluateBadgeMilestones` — watches withdrawal/streak events and writes `profiles_achievements` rows for milestone badges. |
| **Claim signer** | Signs eligible claims with the admin Ed25519 key after verifying `profiles_achievements`. |
| **Claim API** | `GET /api/v1/claim/:network?type=:key&wallet=G...` — checks `profiles_achievements`, then returns signed payload. |
| **Metadata API** | `GET /badge/{token_id}` — serves full JSON metadata using on-chain `token_id → owner`. |

---

## 8. Security Properties

| Property | How enforced |
|----------|-------------|
| **Soulbound** | `transfer()` panics unconditionally |
| **No double-mint** | `Claimed(badge_type, cycle_id, wallet)` checked before mint |
| **Signature replay** | `expiry` timestamp checked + `Claimed` key prevents re-use of same sig |
| **Cross-cycle replay (leaderboard)** | `cycle_id` is in the signed payload — sig for cycle 202605 is invalid for 202606 |
| **Edition caps (manual)** | `EditionCount` checked against `EditionCap` before mint |
| **Admin key compromise** | Rotate via `update_signing_key(new_key)` — only admin can call |
| **Eligibility single source** | Claim endpoint reads `profiles_achievements` only — no dual-path derivation that could disagree |
| **Manual badge gate** | `refresh_policy = 'manual'` returns 403 at the API layer; no signature is issued automatically |

---

## 9. Leaderboard Scoring — Event-Driven Backend

The monthly leaderboard ranking (used to determine leaderboard badge eligibility) is computed entirely from existing deposit and withdrawal records in Supabase. No sampling job is required.

### 9.1 Score formula

```
score(wallet, cycle) =
  Σ over all confirmed deposits that overlap [cycle_start, cycle_end]:
    amount × (
      LEAST(withdraw_confirmed_at ?? cycle_end, cycle_end)
      − GREATEST(deposit_confirmed_at, cycle_start)
    )
```

Unit: **USDC × seconds**. Deposits not yet withdrawn contribute up to `NOW()` (live) or `cycle_end` (final ranking).

### 9.2 Data source

No new columns are needed. The formula uses:

| Field | Source |
|-------|--------|
| `deposit.confirmed_at` | Set by API when deposit is confirmed (`confirmDeposit`) |
| `deposit.amount` | Stored at deposit creation |
| `withdrawal.confirmed_at` | Set by API when withdrawal is confirmed (`confirmWithdrawal`) |

### 9.3 Leaderboard SQL query

Runs once per leaderboard read (live display) or at claim time (badge eligibility):

```sql
SELECT
  d.wallet_address,
  SUM(
    d.amount * EXTRACT(EPOCH FROM (
      LEAST(COALESCE(w.confirmed_at, NOW()), :cycle_end::timestamptz)
      - GREATEST(d.confirmed_at, :cycle_start::timestamptz)
    ))
  ) AS score
FROM deposits d
LEFT JOIN withdrawals w
  ON w.deposit_id = d.id
  AND w.status = 'confirmed'
WHERE d.status = 'confirmed'
  AND d.confirmed_at < :cycle_end
  AND (w.confirmed_at IS NULL OR w.confirmed_at > :cycle_start)
GROUP BY d.wallet_address
ORDER BY score DESC;
```

Pass `NOW()` as `:cycle_end` for the live leaderboard. Pass the cycle's last-second timestamp for badge eligibility.

### 9.4 Lazy rank lookup

`getLeaderboardRankForWallet(walletAddress, cycleId, networkId)` runs the leaderboard query on demand at claim time. No cron job closes cycles. It applies a tiebreaker over the top-15 candidates:

1. Score descending
2. Total completed cycles descending
3. First deposit timestamp ascending (earliest depositor wins ties)

Returns the 1-based rank (1–10) or `null` if the wallet is not in the top 10.

### 9.5 Rank API endpoint

```
GET /api/v1/network/:networkName/leaderboard/rank?wallet=G...
```

- Resolves `getLastClosedCycleId()` automatically — no `cycle` param required from the frontend
- Returns `{ status: 'success', data: { rank: number | null, cycleId: number } }`
- 400 if `wallet` missing; 404 if network not found

### 9.6 API response shape (leaderboard list)

```ts
// GET /network/:networkName/leaderboard?cycle=202605
{
  walletAddress: string,
  score:         number,  // USDC×seconds, closed + open at query time
  activeAmount:  number,  // current total active deposits (for Timer extrapolation)
  cycleStart:    number,  // unix ms
  cycleEnd:      number,  // unix ms
}[]
```

### 9.7 Frontend Timer extrapolation

The live leaderboard display ticks forward using `activeAmount`:

```ts
// each 100ms tick:
elapsed += TICK_MS;
const liveScore = score + activeAmount * (elapsed / 1000);
const displayed = liveScore / ((Date.now() - cycleStart) / 1000);
```

`displayed` is the time-weighted average (USDC) — same visual semantics as the previous ticker.

### 9.8 What is removed

| Removed | Replaced by |
|---------|-------------|
| `apps/job-deposits-history` (minute-by-minute sampling job) | SQL query on demand |
| `total_active_deposits[]` array column in Supabase | Not needed |
| Rolling 30-day window scoring | Fixed calendar month per `cycle_id` |
| Eager cycle-close cron (`closeLeaderboardCycle`) | Lazy `getLeaderboardRankForWallet` at claim time |
| `POST /admin/leaderboard/close` endpoint | Not needed |
| `BADGE_ELIGIBILITY` per-badge raw DB checkers | `profiles_achievements` table lookup |

### 9.9 Migration

Two migrations apply at the start of the next calendar month after deployment:

1. **Score formula cutover**: Hard cutover to event-driven scoring. Scores from prior months (sampled rolling-window format) are not backfilled. The `total_active_deposits` column can be dropped after cutover.

2. **`achievements` table columns** (`20260520_achievements_refresh_policy.sql`): Adds `refresh_policy` (`'auto'` default) and `cycle_scoped` (`false` default) and seeds existing rows. All 19 existing rows are backfilled with correct values.

---

## 10. Frontend — Achievements & Mint UX

### 10.1 One-button mint flow

`AchievementModal` presents a single **"Mint Badge On-Chain"** CTA for badges that have an on-chain counterpart (i.e. `network.badgesContractAddress` is set and the badge is not yet minted). The flow is:

1. **Claim off-chain** (idempotent POST to achievements claim route) — 409 means already claimed, silently continue
2. **Coin-burst animation** using `coinReward` from the claim response
3. User taps **Continue** → Pollar wallet prompt fires (`mintBadge`)
4. On-chain tx confirms → minted state

If the user cancels the Pollar prompt, the achievement stays claimed (coins credited); tapping again skips straight to the Pollar prompt (Step 1 returns 409).

Achievements without a badge contract (no `badgesContractAddress`) continue using the old claim-only flow unchanged.

### 10.2 Leaderboard badge tiles

The three leaderboard badge tiles (`first-place`, `second-place`, `third-place`) use the `useLeaderboardRank` hook, which calls `GET /leaderboard/rank?wallet=G...`. While the query is in flight, the tiles render in a loading skeleton state (`opacity-50 animate-pulse`) and the Mint CTA is hidden. Once the query resolves, only the matching tile unlocks.

`staleTime` is 5 minutes — rank changes at most once per cycle.

---

## 11. Extensibility

New badge types can be added without contract redeployment:

- **New milestone badge:** insert a row into `achievements` with `refresh_policy = 'auto'`, `cycle_scoped = false`, and add the eligibility check to `evaluateBadgeMilestones`. No contract change.
- **New limited-edition badge:** insert a row with `refresh_policy = 'manual'`, then admin calls `register_badge_type(badge_type, OneTimeOnly, Some(max_supply))` on the contract. No contract change.
- **New leaderboard badge:** insert a row with `refresh_policy = 'auto'`, `cycle_scoped = true`, and add the required rank check in the claim route. No contract change.

---

## 12. Operational Decisions

### 12.1 Image storage

Badge images are hosted on Vaquita's own CDN — the same pattern as the existing achievement PNGs at `apps/web/public/icons/achievements/`. The `image` and `animation_url` fields in NFT metadata point to:

```
https://vaquita.fi/assets/badges/{badge_type}.png
https://vaquita.fi/assets/badges/{badge_type}.glb
```

IPFS is not used for v1. The system is centralized by design; adding pinning infrastructure has no benefit at this stage.

### 12.2 Admin key custody

A single Ed25519 key for v1, stored in a secrets manager (not hardcoded). The contract already includes `update_signing_key(new_key)` so the key can be rotated without redeployment if compromised. Risk is bounded: a leaked key can only mint badges for claims whose `expiry` has not passed; rotating the key immediately invalidates all outstanding signatures.

Multisig is deferred until mainnet scale justifies the coordination overhead. Migration trigger: whichever comes first — TVL exceeds $10k or the first full monthly cycle closes on mainnet.

### 12.3 Fee bumping

The protocol sponsors gas for all badge claims via the Privy + Pollar integration. Users never need to hold XLM to claim a badge. The backend wraps the user's signed inner transaction in a fee bump funded from a protocol XLM account before submitting to the network.

### 12.4 Testnet deployment timeline

Target: **deployed and end-to-end tested before the first full monthly cycle closes** (by 2026-05-31). The contract, claim API, and fee bump service must all be live to validate the full claim flow.

---

## 13. FAQ — Design Decisions

### `refresh_policy` and `cycle_scoped`

**Why replace category labels with DB columns?**
The Cat A/B/C/D taxonomy was hardcoded — adding a new badge type required touching multiple code paths. With `refresh_policy` and `cycle_scoped`, badge behavior is data-driven. The claim endpoint and UI read these columns; no code change is needed to add a new badge type with existing behavior.

**What does `refresh_policy = 'manual'` mean for the user?**
The claim endpoint returns 403 with a support contact message. The user cannot self-serve; an admin must issue the signature. Used for limited-edition drops and redeem-code badges where the issuance gate is external.

---

### `profiles_achievements` as eligibility gate

**Why not re-derive eligibility from raw DB signals at claim time?**
The earlier approach ran per-badge eligibility checks (`checkFirstDepositEligibility`, etc.) in the claim route — a second independent path that could disagree with `isEligibleForAchievement`. Moving to `profiles_achievements` as the single gate removes the dual-path risk and simplifies the claim endpoint to one DB read.

---

### Lazy rank lookup

**Why not close the leaderboard cycle eagerly with a cron job?**
Eager closing required a scheduled job, a separate admin endpoint, and pre-computed rank storage. Lazy lookup computes rank on demand from the existing deposit/withdrawal data — the same data the leaderboard UI already queries. At projected claim volumes, the extra query cost per claim is negligible.

---

### Manual badges — Eligibility

**How are limited-edition (`manual`) badge recipients selected?**
The backend maintains a counter per edition; once it reaches `max_supply` it stops writing `profiles_achievements` rows. The contract enforces `EditionCount < EditionCap` independently. No manual whitelist, no team reservations for on-chain cap enforcement.

---

### `badge_type` — Typing

**Is `badge_type` a closed on-chain enum or a free Symbol?**
Free `Symbol` controlled by the backend, matching `achievements.key` exactly (e.g. `"first-place"`). The contract only verifies the Ed25519 signature — it does not whitelist valid badge types. The whitelist lives in the `achievements` table.

---

### `transfer()` — Soulbound

**Are there any edge cases where transfer is allowed?**
No. `transfer()` panics unconditionally with `SoulboundToken`. A burn-and-remint migration path could be added in a future version if there is clear demand, but it is out of scope for v1.

---

### Admin Key Custody

**Who can rotate the signing key?**
v1 (testnet/beta): single key, backend secrets manager. From mainnet deploy: `update_signing_key` is restricted to the CTO plus one additional signer (2-of-3 multisig target before mainnet).

---

### `expiry` — Claim Window and Re-issuance

**What is `expiry` and where is it enforced?**
`expiry` is a Unix timestamp embedded in the signed payload. The contract checks `ledger::timestamp() < expiry` before accepting a claim. Default window: 30 days from the eligibility event.

**What happens if a user misses the expiry?**
For `refresh_policy = 'auto'` badges the backend re-issues the signature on demand. For `refresh_policy = 'manual'` badges, re-issuance requires admin action.

**Why not set `expiry = u64::MAX`?**
A short expiry limits blast radius if the signing key is compromised: rotating the key invalidates all outstanding signatures within 30 days.

---

## 14. References

- [Vaquita NFT Badges System Spec](./Vaquita_NFT_Badges_System.md)
- [OpenZeppelin/stellar-contracts](https://github.com/OpenZeppelin/stellar-contracts)
- [Stellar Docs — Non-Fungible Token](https://developers.stellar.org/docs/build/smart-contracts/example-contracts/non-fungible-token)

---

*— End of whitepaper —*

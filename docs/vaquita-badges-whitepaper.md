# Vaquita Badges — Technical Whitepaper

**Version 0.1 — May 2026**
**Scope: `vaquita-badges` Soroban Smart Contract**

---

## 1. Abstract

Vaquita Badges is a soulbound NFT system built on Stellar/Soroban that rewards users for savings behavior on the Vaquita DeFi platform. It issues NFT badges to users based on leaderboard rankings and platform activity.

All badge categories use a single **admin-signed issuance model**: the backend authorizes every mint via an Ed25519 signature, keeping the system centralized and fully upgradeable without contract redeployment.

All badges are **soulbound**: non-transferable and non-burnable. The contract is built on the **OpenZeppelin Soroban NFT base** and deployed as a standalone `vaquita-badges` contract, separate from `vaquita-pool`.

---

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Contract separation | New `vaquita-badges` contract | Independent deployment, security boundary; pool handles DeFi, badges handle identity |
| NFT base | OpenZeppelin Stellar Contracts | Audited ownership, balance tracking, token ID sequencing |
| Soulbound enforcement | Block transfer + block burn | Permanent identity guarantee; burn adds complexity with no clear v1 benefit |
| Metadata | Fully off-chain (API) | Contract stores only `token_id → owner`; `vaquita.fi/badge/{token_id}` serves display metadata |
| All categories eligibility | Admin-signed payload (Ed25519) | Centralized by design; fully upgradeable without redeployment |
| Cycle replay prevention (A/B) | `cycle_id` in signed payload + claim key | Backend signature is bound to a specific month; cannot be replayed in another cycle |
| `vaquita-pool` modifications | None | All badge claims are pull-based via signed claims; pool stays unchanged |

---

## 3. Badge Catalogue

### 3.1 Category A — Monthly Podium (admin-signed issuance)

| Badge | Trigger | Rarity |
|-------|---------|--------|
| Vaquero de Oro | Leaderboard rank #1 of the month | Legendary |
| Vaquero de Plata | Rank #2 | Epic |
| Vaquero de Bronce | Rank #3 | Rare |

Issued once per monthly cycle. Uses admin Ed25519 signature with `cycle_id` to prevent cross-cycle replay. Ranks #1–3 also receive a Category B badge (two mints, two transactions).

### 3.2 Category B — Top Contributor (admin-signed issuance)

| Badge | Trigger | Rarity |
|-------|---------|--------|
| Top 10 Contributor | Positions 1–10 of the month | Uncommon |

### 3.3 Category C — Personal Milestones (generic issuance)

| Badge | Trigger | Rarity |
|-------|---------|--------|
| Primera Vaquita | Complete first cycle (any period) | Common |
| Maratonista | Complete first 6-month cycle | Rare |
| Trimestral | Complete first 3-month cycle | Uncommon |
| Disciplinado | 30 consecutive days of activity | Rare |
| Veterano | 12 cycles completed without penalty | Epic |

One-time per wallet. Backend monitors withdrawal events to detect completions and issues signed claims.

### 3.4 Category D — Limited Edition (generic issuance)

| Badge | Trigger | Cap | Rarity |
|-------|---------|-----|--------|
| Genesis Saver | First 50 beta wallets | 50 | Legendary |
| Mainnet Pioneer | First deposit on mainnet days 1–7 | window | Epic |
| Hackathon Champion | Special events | variable | Epic |

New editions can be defined on-chain via `add_edition()` admin function without redeployment.

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
    badge_type: Symbol,
    cycle_id: u32,        // YYYYMM for Cat A/B; 0 for Cat C/D
    wallet: Address
  )                                        → ()          (double-claim prevention, all cats)
  DataKey::TokenOwner(token_id: u32)      → Address
  DataKey::EditionCap(edition_id: Symbol) → u32         (max mint for Cat D editions)
  DataKey::EditionCount(edition_id: Symbol) → u32       (minted so far)
```

### 4.2 Public interface

```rust
// --- Admin ---
fn initialize(env, admin: Address, signing_key: BytesN<32>)

// Define a new limited-edition badge type (Cat D)
fn add_edition(env, caller: Address, edition_id: Symbol, max_supply: u32)

// --- User: all categories ---
fn mint_badge(
    env,
    wallet: Address,
    badge_type: Symbol,        // "gold" | "silver" | "bronze" | "top10" | "maratonista" | ...
    cycle_id: u32,             // YYYYMM for Cat A/B; 0 for Cat C/D
    expiry: u64,               // ledger timestamp after which sig is invalid
    signature: BytesN<64>,     // Ed25519 sig over sha256(wallet || badge_type || cycle_id || expiry)
) -> Result<u32, Error>        // returns minted token_id

// --- View ---
fn owner_of(env, token_id: u32) -> Option<Address>
fn total_supply(env) -> u32
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

All categories share the same flow:

```
1. [Event]    Backend detects eligibility event:
                Cat A/B → leaderboard finalized at month close
                Cat C   → withdrawal completed, streak reached, etc.
                Cat D   → genesis wallet registered, mainnet deposit, etc.
2. [Backend]  Signs: ed25519_sign(admin_key, sha256(wallet || badge_type || cycle_id || expiry))
                Cat A/B → cycle_id = YYYYMM (e.g. 202605)
                Cat C/D → cycle_id = 0
3. [API]      Serves signed claim to wallet via /api/claim?type=gold&cycle=202605&wallet=G...
4. [User tx]  Calls mint_badge(wallet, badge_type, cycle_id, expiry, signature).
              Contract: verify sig → check expiry → check not already claimed →
              check edition cap (Cat D) → mint → mark claimed.
```

**Signature verification (Soroban contract):**
```rust
let mut msg = Bytes::new(&env);
msg.append(&wallet.to_xdr(&env));
msg.append(&badge_type.to_xdr(&env));
msg.append(&cycle_id.to_xdr(&env));
msg.append(&expiry.to_xdr(&env));
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

## 6. Cycle IDs

Cycle IDs are `u32` formatted as `YYYYMM` (e.g. `202605` for May 2026). They are set by the backend when signing the claim — the contract does not validate them against ledger time. Cat C/D badges use `cycle_id = 0`.

---

## 7. Off-Chain Infrastructure Required

| Component | Description |
|-----------|-------------|
| **Leaderboard query** | SQL query over `deposits` + `withdrawals` tables — see §9. No sampling job required. |
| **Claim signer** | Backend service that signs eligible claims with the admin Ed25519 key |
| **Claim API** | `GET /api/claim?type=gold&cycle=202605&wallet=G...` — serves signed payloads to frontend |
| **Claim monitor** | Watches for eligibility events (withdrawals, top-10 finalization) and issues signed claims |
| **Metadata API** | `GET /badge/{token_id}` — serves full JSON metadata using on-chain `token_id → owner` |

---

## 8. Security Properties

| Property | How enforced |
|----------|-------------|
| **Soulbound** | `transfer()` panics unconditionally |
| **No double-mint (all cats)** | `Claimed(badge_type, cycle_id, wallet)` checked before mint |
| **Signature replay** | `expiry` timestamp checked + `Claimed` key prevents re-use of same sig |
| **Cross-cycle replay (A/B)** | `cycle_id` is in the signed payload — sig for cycle 202605 is invalid for 202606 |
| **Edition caps (D)** | `EditionCount` checked against `EditionCap` before mint |
| **Admin key compromise** | Rotate via `update_signing_key(new_key)` — only admin can call |

---

## 9. Leaderboard Scoring — Event-Driven Backend

The monthly leaderboard ranking (used to determine Category A/B badge eligibility) is computed entirely from existing deposit and withdrawal records in Supabase. No sampling job is required.

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

Runs once per leaderboard read (live display) or at cycle close (badge eligibility):

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

Pass `NOW()` as `:cycle_end` for the live leaderboard. Pass the cycle's last-second timestamp for final badge eligibility.

### 9.4 API response shape

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

### 9.5 Frontend Timer extrapolation

The live leaderboard display ticks forward using `activeAmount`:

```ts
// each 100ms tick:
elapsed += TICK_MS;
const liveScore = score + activeAmount * (elapsed / 1000);
const displayed = liveScore / ((Date.now() - cycleStart) / 1000);
```

`displayed` is the time-weighted average (USDC) — same visual semantics as the previous ticker.

### 9.6 What is removed

| Removed | Replaced by |
|---------|-------------|
| `apps/job-deposits-history` (minute-by-minute sampling job) | SQL query on demand |
| `total_active_deposits[]` array column in Supabase | Not needed |
| Rolling 30-day window scoring | Fixed calendar month per `cycle_id` |

### 9.7 Migration

Hard cutover at the start of the next calendar month after deployment. Scores from prior months (sampled rolling-window format) are not backfilled — the new formula starts clean at the first cycle boundary post-deploy. The `total_active_deposits` column can be dropped after the cutover.

---

## 10. Extensibility

New badge categories can be added without contract redeployment:

- **New badge type:** backend starts signing with a new `badge_type` Symbol. No contract change.
- **New limited edition:** admin calls `add_edition(edition_id, max_supply)`. No contract change.

---

## 10. Operational Decisions

### 10.1 Image storage

Badge images are hosted on Vaquita's own CDN — the same pattern as the existing achievement PNGs at `apps/web/public/icons/achievements/`. The `image` and `animation_url` fields in NFT metadata point to:

```
https://vaquita.fi/assets/badges/{badge_type}.png
https://vaquita.fi/assets/badges/{badge_type}.glb
```

IPFS is not used for v1. The system is centralized by design; adding pinning infrastructure has no benefit at this stage and can be revisited if on-chain permanence becomes a requirement.

### 10.2 Admin key custody

A single Ed25519 key for v1, stored in a secrets manager (not hardcoded). The contract already includes `update_signing_key(new_key)` so the key can be rotated without redeployment if compromised. Risk is bounded: a leaked key can only mint badges for claims whose `expiry` has not passed; rotating the key immediately invalidates all outstanding signatures.

Multisig is deferred until mainnet scale justifies the coordination overhead.

### 10.3 Fee bumping

The protocol sponsors gas for all badge claims. The backend:

1. Receives the user's signed inner transaction
2. Wraps it in a fee bump funded from a protocol XLM account
3. Submits the fee-bumped transaction to the network

The user never needs to hold XLM. At ~63 mints/month projected, the protocol cost is negligible (fractions of a cent per claim).

### 10.4 Testnet deployment timeline

Target: **deployed and end-to-end tested before the first full monthly cycle closes** (by 2026-05-31). This allows a real claim flow — cycle data → backend signs → user claims → badge minted — to be validated before mainnet. The contract, claim API, and fee bump service must all be live for this test to run.

---

## 11. FAQ — Design Decisions

### Category D — Eligibility

**How are Genesis Saver (D1) recipients selected?**
Pure on-chain FIFO: the first 50 wallets to execute a deposit on testnet receive the badge. The backend maintains a counter; once it reaches 50 it stops signing D1 claims. No manual whitelist, no team reservations.

**Is there a numeric cap on Mainnet Pioneer (D2)?**
No. Any wallet that makes its first mainnet deposit within days 1–7 of mainnet launch receives the badge, regardless of how many wallets qualify. The criterion is temporal, not positional.

**Do wallets that used testnet qualify for Mainnet Pioneer (D2)?**
Yes. The only condition is a first deposit on mainnet within the 7-day window. Prior testnet activity does not disqualify a wallet.

---

### `badge_type` — Typing

**Is `badge_type` a closed on-chain enum or a free Symbol?**
Free `Symbol` controlled by the backend. The contract only verifies the Ed25519 signature — it does not whitelist valid badge types. The whitelist lives in the backend, which means new Category D editions can be added via `add_edition()` without any contract change.

---

### `transfer()` — Soulbound

**Are there any edge cases where transfer is allowed (lost wallet, migration)?**
No. `transfer()` panics unconditionally with `SoulboundToken`. If a user loses their wallet, the badge is lost. A burn-and-remint migration path could be added in a future version if there is clear demand, but it is out of scope for v1.

---

### Admin Key Custody

**How is the signing key stored and who can rotate it?**
v1 (testnet and beta): single Ed25519 key stored in the backend `.env` / secrets manager. Before mainnet launch the key migrates to a 2-of-3 multisig. Migration trigger: whichever comes first — TVL exceeds $10k or the first full monthly cycle closes on mainnet. Key rotation via `update_signing_key` is restricted to the CTO plus one additional signer from mainnet deploy onward.

---

### `expiry` — Claim Window and Re-issuance

**What is `expiry` and where is it enforced?**
`expiry` is a Unix timestamp embedded in the signed payload by the backend. The contract checks `ledger::timestamp() < expiry` before accepting a claim. The backend sets the window (default: 30 days from the eligibility event); the contract enforces it. The badge itself never expires — only the signature does.

**What happens if a user misses the expiry on a Category A/B/C badge?**
The backend re-issues the signature on demand, transparently. From the user's perspective claiming is always available. Re-issuance policy: automatic for Cat A, B, and C (eligibility is permanent once earned); manual and at team discretion for Cat D.

**Why not set `expiry = u64::MAX` to avoid all this?**
A short expiry limits blast radius if the signing key is compromised: rotating the key invalidates all outstanding signatures within 30 days. Without expiry, a leaked key allows minting arbitrary badges permanently even after rotation.

---

### Fee Bumping

**Who pays gas for badge claims?**
Fee bumping is handled by the Privy + Pollar integration. Users never need to hold XLM to claim a badge. Implementation owner: Oscar Gauss.

---

### Metadata and Image Storage

**Where are badge images and metadata JSON hosted?**
Vaquita's own API (`https://vaquita.fi/badge/{token_id}`). Full control over images and metadata with no dependency on IPFS pinning. This is consistent with the existing achievement assets at `apps/web/public/icons/achievements/`.

---

### Timeline

**When does the `vaquita-badges` contract deploy to testnet?**
End of Tranche 2, Week 16.

---

## 12. References

- [Vaquita NFT Badges System Spec](./Vaquita_NFT_Badges_System.md)
- [Leaderboard Scoring Research](./research-leaderboard-scoring.md)
- [OpenZeppelin/stellar-contracts](https://github.com/OpenZeppelin/stellar-contracts)
- [Stellar Docs — Non-Fungible Token](https://developers.stellar.org/docs/build/smart-contracts/example-contracts/non-fungible-token)

---

*— End of whitepaper —*

# On-Chain Leaderboard Scoring — Research Findings

> Scope: how decentralized applications handle leaderboard-based reward/badge eligibility on smart contracts.
>
> **Hard requirement:** "Implementation of an on-chain leaderboard reward system that issues NFT badges
> to top users based on platform activity."

---

## Selected approach: Merkle snapshot distribution

Off-chain compute determines the monthly winner list. A Merkle tree is built over the eligible
wallets, and its root is posted on-chain once per cycle. Users claim badges by submitting a
Merkle proof; the contract verifies the proof and mints the badge.

**Why this satisfies the requirement:** the verification, claim state, and badge minting all
happen on-chain. The root is public and auditable. Anyone can verify a winner's proof independently.

**Why not on-chain accumulation:** the current scoring formula requires 43,200 samples per
wallet per month — not feasible under Soroban's compute budget. A simpler on-chain formula
(e.g. `score += amount` on deposit) would require changing the product's scoring semantics, which
is a product decision outside the scope of the badge contract.

---

## Official Soroban reference: `stellar/soroban-examples/merkle_distribution`

This is the canonical on-chain Merkle distributor for Soroban. Full source below.

### Contract interface

```rust
// Initialize once: store root hash + fund the contract with tokens
fn __constructor(env, root_hash: BytesN<32>, token: Address, funding_amount: i128, funding_source: Address)

// User claims by submitting their leaf data + proof
fn claim(env, index: u32, receiver: Address, amount: i128, proof: Vec<BytesN<32>>) -> Result<(), Error>
```

### Hashing scheme

Leaves are hashed using **SHA-256 over XDR-serialized structs**:

```rust
let node = Receiver { index, address: receiver.clone(), amount };
let mut hash = env.crypto().sha256(&node.to_xdr(&env));
```

Sibling pairs are combined **commutatively** (sorted before hashing) — eliminates left/right
ordering bugs and matches the OpenZeppelin JS `merkle-tree` library:

```rust
for p in proof {
    let a = hash.to_array();
    let b = p.to_array();
    let (left, right) = if a < b { (a, b) } else { (b, a) };
    let mut combined = [0u8; 64];
    combined[..32].copy_from_slice(&left);
    combined[32..].copy_from_slice(&right);
    hash = env.crypto().sha256(&BytesN::from_array(&env, &combined).into());
}
```

### Replay / double-claim prevention

Keyed by leaf index (`u32`). Before minting, check; after minting, set:

```rust
let key = DataKey::Claimed(index);
if env.storage().instance().has(&key) {
    return Err(Error::AlreadyClaimed);
}
// ... verify and transfer ...
env.storage().instance().set(&key, &());
```

### Storage layout

```rust
enum DataKey {
    RootHash,           // BytesN<32> — the Merkle root for this distribution
    TokenAddress,       // Address — token contract
    Claimed(u32),       // () — claimed flag keyed by leaf index
}
```

> **Storage type note:** the official example uses **instance** storage for all keys.
> For Vaquita, claimed state must survive across cycles — use **persistent** storage
> for `Claimed` keys and bump their TTL on each access.

---

## Adapting for `vaquita-badges`

### Leaf structure (replace `Receiver`)

```rust
#[contracttype]
struct BadgeLeaf {
    pub cycle_id:  u32,      // e.g. 202605 for May 2026
    pub wallet:    Address,
    pub category:  Symbol,   // "gold" | "silver" | "bronze" | "top10"
}
```

Leaf hash: `sha256(BadgeLeaf { cycle_id, wallet, category }.to_xdr(&env))`

### Per-cycle root management

Instead of a single root, store one root per cycle:

```rust
DataKey::CycleRoot(cycle_id: u32)  → BytesN<32>
DataKey::CycleOpen(cycle_id: u32)  → bool        // claim window open/closed
```

Admin calls `post_root(cycle_id, root_hash)` to open the claim window.
Admin can call `close_cycle(cycle_id)` after the 30-day window to stop claims.

### Claim state (persistent, cycle-scoped)

```rust
// keyed by (cycle_id, wallet, category) — not just index
DataKey::Claimed(cycle_id: u32, wallet: Address, category: Symbol) → ()
```

Using composite keys instead of a flat `u32` index avoids index collisions across cycles
and makes the storage self-describing.

### Claim function

```rust
pub fn claim(
    env: Env,
    cycle_id: u32,
    wallet: Address,
    category: Symbol,        // "gold" | "silver" | "bronze" | "top10"
    proof: Vec<BytesN<32>>,
) -> Result<u32, Error>      // returns minted token_id
```

`wallet.require_auth()` — only the wallet itself can claim its own badge (prevents griefing
by minting soulbound tokens to wallets that don't want them).

### Claim window enforcement

```rust
let cycle_end: u64 = env.storage().persistent().get(&DataKey::CycleEnd(cycle_id)).unwrap();
if env.ledger().timestamp() > cycle_end {
    return Err(Error::ClaimWindowExpired);
}
```

---

## Off-chain tooling required (backend)

| Step | What happens |
|------|-------------|
| Cycle close | Backend reads final leaderboard scores, produces ranked list |
| Tree build | `@openzeppelin/merkle-tree` JS library builds tree over `[cycle_id, wallet, category]` leaves |
| Root post | Backend submits `post_root(cycle_id, root)` tx to `vaquita-badges` |
| Proof serve | API endpoint serves each wallet's proof (wallet queries `/api/badge-proof?cycle=202605&wallet=G...`) |
| Frontend | User clicks "Claim", frontend fetches proof, submits `claim(cycle_id, wallet, category, proof)` |

---

## Category C — Personal milestones (no Merkle needed)

Category C badges (Primera Vaquita, Maratonista, etc.) are verified trustlessly via
cross-contract call to `vaquita-pool`. On on-time withdrawal, the pool must write a
completion receipt:

```rust
// In vaquita-pool withdraw(), on-time path:
DataKey::CompletedCycles(owner: Address, lock_period: u64) → u32  // count of completions
```

`vaquita-badges` calls `vaquita-pool::get_completed_cycles(wallet, lock_period)` and checks
the count. No admin or Merkle proof required — fully trustless.

**Required change to `vaquita-pool`:** add completion receipt storage on the on-time
withdrawal path. Small addition to `lib.rs`.

---

## Category D — Limited edition events (admin-signed payload)

Low volume, event-specific. Backend signs `(wallet, edition_id, expiry)` with Ed25519.
Contract verifies via `env.crypto().ed25519_verify()`.

```rust
pub fn claim_special(
    env: Env,
    wallet: Address,
    edition_id: Symbol,
    expiry: u64,
    signature: BytesN<64>,
) -> Result<u32, Error>
```

No Merkle needed: Genesis Saver (50 wallets) and Mainnet Pioneer are too sparse and
time-boxed to justify a full tree.

---

## Summary

| Category | Mechanism | Trustless? | Admin action required |
|----------|-----------|-----------|----------------------|
| A — Monthly podium | Merkle snapshot | Yes (proof verifiable by anyone) | `post_root()` once/month |
| B — Top 10 | Merkle snapshot (same tree as A) | Yes | Same root |
| C — Personal milestones | Cross-contract call to pool | Yes | None |
| D — Limited edition | Ed25519 signed payload | No (admin trusted) | Sign per wallet |

---

## Sources

- [stellar/soroban-examples — merkle_distribution](https://github.com/stellar/soroban-examples/tree/main/merkle_distribution)
- [OpenZeppelin stellar-contracts — Merkle Trees (DeepWiki)](https://deepwiki.com/OpenZeppelin/stellar-contracts/6.4.2-merkle-trees)
- [JamesBachini — SEP-41 Token Airdrop Using Merkle Tree](https://jamesbachini.com/sep-41-token-airdrop-merkle/)
- [findolor/sorodrop — Stellar Merkle airdrop tooling](https://github.com/findolor/sorodrop)
- [Stellar Community Fund — Merkle Tree Airdrop Tooling](https://communityfund.stellar.org/project/merkle-tree-airdrop-tooling)
- [Uniswap/merkle-distributor — reference EVM implementation](https://github.com/Uniswap/merkle-distributor)

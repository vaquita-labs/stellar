# Scout (scout-soroban) Report — `vaquita-pool` + `vaquita-badges`

**Date:** 2026-08-14
**Tool:** [CoinFabrik/scout-soroban](https://github.com/CoinFabrik/scout-soroban) via `cargo-scout-audit` v0.3.16
**Scout toolchain:** `nightly-2025-08-07` (installed and managed by scout itself)
**Host toolchain:** rustc 1.95.0 / cargo 1.95.0, `x86_64-apple-darwin`
**Scope:** `contracts/` workspace — both member crates, 36 detectors
**Result:** **21 findings** — 7 Critical, 5 Medium, 1 Minor, 8 Enhancement (scout's own severity labels)

After triage against the source: **0 exploitable issues**, 6 legitimate improvements, 6 deliberate design decisions worth re-confirming, 5 findings already mitigated by build configuration, and 4 false positives. No contract files were modified.

---

## ⚠️ Read this before trusting any scout run

**Scout's first run on this workspace reported `Analyzed | 0 | 0 | 0 | 0` for both crates — a false all-clear.**

The `dylint_driver` build script clones `rust-lang/rust-clippy`, and that clone failed on a transient network error:

```
error: failed to run custom build command for `dylint_driver v4.1.2`
  error: RPC failed; curl 92 HTTP/2 stream 5 was not closed cleanly: CANCEL (err 8)
  fatal: fetch-pack: invalid index-pack output
```

Scout **still printed a clean summary table and exited 0**. The contracts were never compiled or linted — the only mention of `vaquita_*` anywhere in that run's log was the summary table itself.

**How to tell a real run from a fake one:** a genuine run contains these lines in its output —

```
Checking vaquita-badges v0.0.0 (/…/contracts/vaquita-badges)
Checking vaquita-pool v0.0.0 (/…/contracts/vaquita-pool)
```

If those lines are absent, the zeros are meaningless. **Any CI integration of scout must grep for them (or for a non-zero detector count) rather than trusting the exit code**, otherwise a network blip silently turns the security gate green.

The re-run with HTTP/1.1 forced produced the 21 findings below.

## Reproducing this run

```bash
cargo install cargo-scout-audit          # v0.3.16; ~7 min build
cd contracts
cargo check --workspace                  # prerequisite: scout won't run if compilation fails
cargo scout-audit --output-format md --output-path scout-report.md
```

If the `dylint_driver` clone fails, force HTTP/1.1 without touching global git config:

```bash
GIT_CONFIG_COUNT=3 \
GIT_CONFIG_KEY_0=http.version    GIT_CONFIG_VALUE_0=HTTP/1.1 \
GIT_CONFIG_KEY_1=http.postBuffer GIT_CONFIG_VALUE_1=524288000 \
GIT_CONFIG_KEY_2=http.lowSpeedLimit GIT_CONFIG_VALUE_2=0 \
cargo scout-audit --output-format md --output-path scout-report.md
```

First run takes roughly 45–60 min on this machine (detector compilation ~35 min, driver + analysis ~15 min). Scout rebuilds the driver in a fresh temp dir on every invocation, so subsequent runs are not much cheaper.

## Summary

| Crate | Status | Critical | Medium | Minor | Enhancement |
|-------|--------|---------:|-------:|------:|------------:|
| `vaquita_badges` | Analyzed | 4 | 2 | 1 | 3 |
| `vaquita_pool` | Analyzed | 3 | 3 | 0 | 5 |

| Detector | Severity | Count | Triage verdict |
|----------|----------|------:|----------------|
| `unprotected-update-current-contract-wasm` | Critical | 2 | ❌ False positive |
| `integer-overflow-or-underflow` | Critical | 5 | ⚠️ Mitigated — hardening optional |
| `contract-import-dependency` | Medium | 2 | ✅ Real — known issue |
| `ineffective-extend-ttl` | Medium | 2 | ⚠️ Real mechanism, deliberate design |
| `unsafe-unwrap` | Medium | 1 | ❌ False positive |
| `soroban-version` | Enhancement | 2 | ✅ Real and material |
| `storage-change-events` | Enhancement | 2 | ✅ Real — observability gap |
| `assert-violation` | Enhancement | 4 | ⚠️ Real by the book, deliberate |
| `unused-return-enum` | Minor | 1 | ❌ False positive |

> Note: scout's own "Issues found" index over-counts two categories (it lists 8 results for `contract-import-dependency` and 6 for `assert-violation`, while the detail tables hold 2 and 4). The detail tables are authoritative and sum correctly to 21.

---

## Critical

### 1. `unprotected-update-current-contract-wasm` (2) — ❌ False positive

| Package | Location |
|---------|----------|
| `vaquita-badges` | `src/upgrade.rs:108` |
| `vaquita-pool` | `src/upgrade.rs:102` |

Both flagged calls are the final statement of `execute_upgrade`, and both functions open with an owner check:

- `vaquita-badges/src/upgrade.rs:70-71` → `admin::require_owner(env)?`
- `vaquita-pool/src/upgrade.rs:61-62` → `crate::admin::require_owner(env)?`

`require_owner` resolves the stored `Admin` address and calls `.require_auth()` on it in both contracts. On top of that, the upgrade is two-phase and timelocked (`PendingUpgradeHash` + `UpgradeReadyAt`), so an authorized caller still cannot upgrade instantly.

The detector does not trace authorization interprocedurally — it only recognises a `require_auth()` in the same function body. **No action.**

### 2. `integer-overflow-or-underflow` (5) — ⚠️ Mitigated, hardening optional

| ID | Package | Location | Expression |
|----|---------|----------|------------|
| 7 | `vaquita-badges` | `src/storage.rs:17` | `max_live_until_ledger() - sequence()` |
| 10 | `vaquita-badges` | `src/lib.rs:102` | `count + 1` (edition counter) |
| 11 | `vaquita-badges` | `src/lib.rs:125` | `token_id + 1` (`NextTokenId`) |
| 16 | `vaquita-pool` | `src/positions.rs:108` | `global + 1` (`PositionCount`) |
| 17 | `vaquita-pool` | `src/positions.rs:117` | `per_period + 1` (per-period count) |

The detector's stated risk is *"the operation will result in an inexact result"* — silent wrapping. **That failure mode does not exist here:** `contracts/Cargo.toml:21` sets `overflow-checks = true` on the release profile, so any overflow panics and reverts the transaction rather than producing a wrong number.

Reachability of each:

- **ID 7** — `max_live_until_ledger()` is always ≥ `sequence()` by construction, so the subtraction cannot underflow.
- **IDs 10, 11, 16, 17** — monotonic counters. Reaching the bound requires 2³²/2⁶⁴ mints or positions, which is not achievable.

Switching these to `checked_add`/`saturating_add` would be defensible defence-in-depth and would silence the detector, but there is no live risk. Note the codebase already uses `saturating_add` for version counters in both upgrade modules, so the convention exists if you want consistency.

---

## Medium

### 3. `contract-import-dependency` (2) — ✅ Real, previously identified

`vaquita-pool/src/defindex_vault.rs:1` — the `contractimport!` macro embeds the DeFindex vault WASM without declaring it as a tracked dependency, so a stale vault binary will still pass tests and can ship unnoticed.

This matches a finding already recorded in `docs/vaquita-pool-critical-fixes-prd.md` ("The vault WASM is imported by relative path without version pinning") and the note in `contracts/README.md` that testnet DeFindex addresses change on every reset. Worth resolving with an explicit pin/checksum on the imported WASM.

### 4. `ineffective-extend-ttl` (2) — ⚠️ Real mechanism, deliberate design

`vaquita-badges/src/storage.rs:23` and `:29`:

```rust
fn max_ttl(env: &Env) -> u32 {
    env.ledger().max_live_until_ledger() - env.ledger().sequence()
}

pub fn extend_instance(env: &Env) {
    let ttl = max_ttl(env);
    env.storage().instance().extend_ttl(ttl, ttl);   // threshold == extend_to
}
```

Both TTL arguments are the same binding. Since an entry's remaining TTL can never exceed the maximum, the `remaining <= threshold` condition is effectively always true, so **every** state-changing call performs a TTL-bump write instead of only bumping when the entry approaches expiry.

This is intentional and documented in the module header ("Both helpers always extend to the ledger's maximum live-until point… Soulbound badges must not expire"). It is not a correctness bug — it is a recurring fee cost on every call. Worth a conscious confirmation that the cost is acceptable; if not, set the threshold well below the extend-to target.

### 5. `unsafe-unwrap` (1) — ❌ False positive

`vaquita-pool/src/upgrade.rs:47-51`. The `.unwrap()` is guarded four lines above by an explicit presence check that returns a typed error:

```rust
if !env.storage().instance().has(&DataKey::PendingUpgradeHash) {
    return Err(VaquitaPoolError::UpgradeNotProposed);
}
let hash: BytesN<32> = env.storage().instance().get(&DataKey::PendingUpgradeHash).unwrap();
```

The unwrap cannot fail. Collapsing the `has` + `get` into a single `get(...).ok_or(...)` would be marginally tidier and would silence the lint, but there is no defect.

---

## Minor

### 6. `unused-return-enum` (1) — ❌ False positive

`vaquita-badges/src/lib.rs:139` returns `Err(BadgeError::SoulboundToken)` unconditionally. The `Ok` variant is genuinely unreachable **by design** — this is the soulbound transfer entry point, which must always reject. The signature must stay `Result<(), BadgeError>` to satisfy the token interface. **No action.**

---

## Enhancement

### 7. `soroban-version` (2) — ✅ Real and material

`contracts/Cargo.toml` pins `soroban-sdk = "22.0.3"`, resolving to **22.0.11** in `Cargo.lock`. The latest published SDK is **27.0.6** (2026-08-13) — five major versions behind.

This is the single most consequential item in the report. An SDK upgrade of that span is a real project with breaking changes and a required re-audit of storage/TTL semantics, so it should be planned deliberately rather than done casually — but it should be planned. It also interacts with the `wasm32v1-none` target and the pinned DeFindex WASM in finding 3.

### 8. `storage-change-events` (2) — ✅ Real observability gap

| Package | Location |
|---------|----------|
| `vaquita-badges` | `src/lib.rs:231` → `update_upgrade_timelock_secs` |
| `vaquita-pool` | `src/lib.rs:550` → `update_upgrade_timelock_secs` |

Confirmed by reading both implementations: each writes `DataKey::UpgradeTimelockSecs` and emits **no event**, while sibling admin operations in the same modules do emit (`emit_upgrade_executed`, etc.).

Changing the upgrade timelock is a security-relevant admin action, and off-chain observers currently cannot see it happen. This is worth fixing and is consistent with the repo's own stated goal in `docs/vaquita-pool-critical-fixes-prd.md` that admin functions should emit events.

### 9. `assert-violation` (4) — ⚠️ Real by the book, deliberate here

| Package | Location |
|---------|----------|
| `vaquita-badges` | `src/lib.rs:28` |
| `vaquita-pool` | `src/lib.rs:60`, `:63`, `:66` |

All four are argument validation inside `__constructor`, each with a comment tying it to a prior finding — e.g. `assert!(early_withdrawal_fee_bps >= 0 && early_withdrawal_fee_bps <= 2000)` and `assert!(upgrade_timelock_secs >= MIN_UPGRADE_TIMELOCK_SECS)`.

The general advice (return typed errors, don't panic) is sound for runtime entry points, but a constructor panic is the correct and intended behaviour: invalid deployment parameters must abort the deployment transaction outright. A Soroban constructor also cannot return a `Result`. **No action; keep as-is.**

---

## Recommendation

Scout is worth keeping, unlike soroban-analyzer (see `docs/soroban-analyzer-report.md`). It is actively maintained, its 36 detectors are Soroban-aware, and it produced 6 genuinely useful items on a codebase that has already been through a hardening pass.

Suggested follow-up, in priority order:

1. **Plan the `soroban-sdk` 22 → 27 upgrade** (finding 7) — largest real gap.
2. **Emit events on `update_upgrade_timelock_secs`** in both contracts (finding 8) — small, clearly correct.
3. **Pin the imported DeFindex vault WASM** (finding 3) — already a known item.
4. **Confirm the always-extend TTL policy is an accepted cost** (finding 4).
5. Optionally switch the five flagged counters to `checked_add`/`saturating_add` for consistency with existing code (finding 2).

**If scout goes into CI**, the gate must assert that the `Checking vaquita-pool` / `Checking vaquita-badges` lines appear in the output. Without that check a failed driver build reports a clean pass, which is worse than not running the tool at all. Note also that a first run costs ~45–60 min of compute, so caching scout's toolchain and detector build is a prerequisite for it being practical on every PR.

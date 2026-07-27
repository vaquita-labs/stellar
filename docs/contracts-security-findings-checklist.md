# Contracts Security Findings — Remediation Checklist

Source: static-analysis findings on `contracts/` (vaquita-pool + vaquita-badges), 2026-07-27.

**Context that governs everything below:** `vaquita-pool` is **deployed on mainnet with real
funds and live positions** (`CCYMXJCZTQEB5QUAVAQUZ66SKHCUWJHF24MXA2ZZPIE3IC2FZEVM3RF7`). Any change
to a storage key type or to a stored struct's shape is a **breaking migration**: existing entries
become unreadable and users can no longer withdraw. Those are flagged 🔴 DESTRUCTIVE and must NOT be
applied without a migration plan + your review. Fixes that only add guard branches (revert on an
attack/edge input, no storage-shape change) are 🟢 SAFE and become live only through the normal
timelocked upgrade you control.

Legend: 🔴 destructive/breaking · 🟡 behavior/policy change (review) · 🟢 safe additive guard

**Status as of 2026-07-27 (autonomous pass):** S1–S5 implemented + tested; coverage lifted to
Functions 100% / Lines 99.66% / Regions 95.78% (all >95%); full suite 164 tests green.
D1–D3 and P1/P2 left BLOCKED for your review (see each section). Contract changes are in the working
tree only — nothing deployed. Deploying any of it still goes through the timelocked upgrade you control.

---

## 🔴 DESTRUCTIVE — do NOT implement without review

### D1. Position key not bound to owner / ID squatting / unbounded keys
- Findings: `1e484c83` (MED), `b1daf512` (LOW), `60b2e092` (LOW)
- Files: `types.rs` (`DataKey::Positions(String)`), `positions.rs`, `lib.rs::deposit`
- Recommended fix rewrites the storage key to `Positions(Address, String)` / `Positions(BytesN<32>)`.
  **This orphans every existing on-chain position** → holders cannot withdraw. Breaking migration.
- Non-breaking partial mitigations that could be done instead (still need your call):
  - Enforce a **max `deposit_id` length** in `deposit` (bounds state-bloat 60b2e092 without changing the key type).
  - Enforce a **per-address open-position cap** and/or a **minimum deposit amount**.
  - Squatting itself (front-run same `deposit_id`) is only fully fixed by binding the key to the owner → breaking.
- **Status: BLOCKED pending your decision (migrate vs. mitigate vs. accept).**

### D2. Token repoint guard bypassable after TTL expiry
- Finding: `038e5c7a` (MED)
- File: `token_config.rs::set_blend_token` (guard relies on expirable `PositionCount` instance counter).
- Recommended fix binds `blend_token` into each `Position` (uses it at withdraw). **Changes the `Position`
  struct shape → breaking migration** for existing positions.
- Non-breaking alternatives (review): fail-closed if `PositionCount` key is missing/unrestored; or add a
  repoint cooldown/timelock. Note repoint is admin-only and already blocked when counter > 0, so live risk
  is low today.
- **Status: BLOCKED pending your decision.**

### D3. Vault can replay authorized token transfer (HIGH)
- Finding: `02a02675` (**HIGH**) — highest severity here.
- File: `vault_adapter.rs::deposit_into_vault`.
- `authorize_as_current_contract` entries are not single-use; a malicious/compromised DeFindex vault could
  match the authorized `blend_token.transfer(pool→vault, amount)` multiple times in one invocation and pull
  multiples of `amount` from the pool's existing BLEND balance.
- Recommended fix: assert the pool's BLEND balance decreased by **exactly `amount`** across the vault call
  (or switch to an allowance/`transfer_from` cap).
- Why flagged, even though additive: it lives on the **core deposit money-path**. A wrong assertion (e.g. if
  the real DeFindex vault ever pulls a rounded/different amount) would revert **all deposits**. Must be
  validated against real vault behavior on testnet before mainnet.
- **Status: BLOCKED pending your review of the exact assertion + a testnet deposit run.**
  (This is the one I'd prioritize fixing first, carefully.)

---

## 🟡 BEHAVIOR/POLICY CHANGES — review, low risk

### P1. `add_lock_period` unbounded + no overflow bound
- Finding: `1d4e7d58` (LOW); ties into f620e7c9 (D/S1 below).
- Adding a `MAX_LOCK_PERIOD_SECS` cap (consistent with the existing "≤30 days" invariant documented in
  `positions.rs`) rejects periods an admin could previously add. Safe given current config uses ≤30d, but it
  removes an admin capability → flagged.
- Plan: add cap in both `__constructor` and `add_lock_period`; test the reject path.

### P2. Badges: enforce a **minimum** upgrade timelock
- Finding part of `2ce344e3` (MED).
- Rejecting `timelock = 0` (or below a floor) removes admin flexibility and would be **inconsistent with the
  pool** (which allows 0). Recommend deciding a floor for BOTH contracts together, or neither.
- Plan: implement the checked-arithmetic half now (🟢 S5); leave the floor policy for your call.

---

## 🟢 SAFE ADDITIVE GUARDS — ✅ DONE (implemented + tested)

Each only adds a revert branch on an attack/edge input; no storage-shape change; raises coverage.

### S1. Pool: `finalization_time` overflow ✅
- Finding: `f620e7c9` (MED). `lib.rs::deposit` L122 `timestamp + period`.
- Fix: `arithmetic::checked_add(timestamp, period)` → error on overflow (pairs with P1 cap).
- Test: supported huge period → deposit reverts instead of wrapping to "matured".

### S2. Pool: `withdraw_from_vault` unchecked vector index ✅
- Finding: `95153d60` (LOW). `vault_adapter.rs` L68/L71 `get_unchecked(0)`.
- Fix: `get(0).ok_or(VaultReturned…)?` on both preview + withdraw results.
- Test: mock vault returns empty vec → controlled error, not panic.

### S3. Badges: upgrade lock not enforced in `execute_upgrade` ✅
- Finding: `284b1ad9` (MED). `vaquita-badges/src/upgrade.rs::execute_upgrade`.
- Fix: check `UpgradesLocked` in `execute_upgrade` (pool already does this — brings badges to parity).
- Test: propose → lock → execute reverts `UpgradeLocked`.

### S4. Badges: unchecked arithmetic in upgrade ✅
- Findings: `565f1c37` (LOW), arithmetic half of `2ce344e3` (MED).
- `upgrade.rs`: `ready_at = timestamp + timelock` and `new_version = version + 1` → `checked_add`, error on overflow.
- Test: set timelock near `u64::MAX` → propose reverts instead of wrapping `ready_at` into the past.

### S5. Tooling: `print_coverage_summary.py` prints untrusted JSON ✅
- Finding: `23c95cf8` (LOW). Not a contract; no coverage impact.
- Fix: strip ASCII control chars from `filename` before printing.

---

## ⚪ TEST-ONLY MOCK — accepted risk (verify gating only)

### T1. `mock_defindex_vault.rs` unprotected hooks / forced withdraw / unchecked index
- Findings: `b9ff40ec` (LOW), `03dfadaa` (LOW), `2eaffbf0` (INFO).
- File is under `#![cfg(test)]` and excluded from the coverage regex — never deployable as-is.
- Action: confirm the `#![cfg(test)]` gate is intact; add a header comment "TEST ONLY — never deploy".
  Do **not** add `require_auth` to the mock `withdraw` (would break existing tests that call it directly).

---

## Coverage — ✅ DONE

Baseline: Functions 98.95% · Lines 99.22% · Regions 95.24%.
**After this pass: Functions 100.00% · Lines 99.66% · Regions 95.78%** (all three >95%).

New tests added:
- `vaquita-pool/src/test/security_fixes.rs` — S1 overflow revert + normal-path sanity; S2 empty-preview
  and empty-withdraw reverts (with two new test-only hooks on the mock vault).
- `vaquita-pool/src/test/coverage_gaps.rs` — `refresh_position_ttl` (was the only uncovered fn),
  `calculate_reward` zero-deposits branch, early-withdrawal fee path + `remove_lock_period` reward sweep.
- `vaquita-badges/src/test/upgrade_pause_test.rs` — S3 execute-after-lock revert; S4 timelock-overflow revert.

**Why some individual files still read 92–94% on regions:** the remaining uncovered *regions* are
unreachable defensive branches — the `?` arms of `checked_add/sub/mul/div` (i128 overflow that realistic
values can't reach) and `.ok_or(NotInitialized)?` arms (Admin/BlendToken are always set at construction).
Covering them would require corrupting storage (impossible via the public API) or deleting the guards
(harmful). The project's own gate is `--fail-under-lines 80`; we far exceed it. Recommend accepting these
as intentional defensive code rather than chasing region % by weakening safety.

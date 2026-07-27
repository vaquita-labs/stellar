# Contracts Security Findings — Remediation Checklist

Source: static-analysis findings on `contracts/` (vaquita-pool + vaquita-badges), 2026-07-27.

**Context update (2026-07-27):** the team is **deploying a NEW contract**, not upgrading the live
mainnet one, so there are **no existing positions to migrate** — the storage-shape changes that were
"destructive" are now clean design choices on a fresh deploy. All findings below are now resolved at
the **contract layer**.

Legend: 🔴 was-destructive (now unblocked by fresh deploy) · 🟡 policy · 🟢 safe additive guard

**Status:** S1–S5 + D1–D3 + P1–P2 all implemented and tested. `make coverage` = Functions 100% /
Lines 99.67% / Regions 95.96% (all >95%); full suite **169 tests green**. Contract changes are on
`dev`. **Phase 2 (cross-stack) is NOT done:** the D1 change alters `deposit`/`withdraw` to take a
`nonce: u64` instead of a `String` deposit_id — the frontend, API, listener, job, and the
`deposits.deposit_id_hex` column must be updated to match before the new contract goes live (see
"Cross-stack follow-up" at the end).

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
- **Status: ✅ RESOLVED (contract layer).** Positions are now keyed by a contract-derived
  `deposit_id = sha256(caller ‖ nonce)` (`DataKey::Positions(BytesN<32>)`). `deposit`/`withdraw` take a
  `nonce: u64`; `compute_deposit_id(caller, nonce)` is exposed for off-chain matching. Because the id is
  a function of the caller, squatting is impossible and the redundant `NotOwner` check in `withdraw` was
  removed (a wrong caller derives a different id → `PositionNotFound`). Requires the Phase-2 cross-stack
  updates.

### D2. Token repoint guard bypassable after TTL expiry
- Finding: `038e5c7a` (MED)
- File: `token_config.rs::set_blend_token` (guard relies on expirable `PositionCount` instance counter).
- Recommended fix binds `blend_token` into each `Position` (uses it at withdraw). **Changes the `Position`
  struct shape → breaking migration** for existing positions.
- Non-breaking alternatives (review): fail-closed if `PositionCount` key is missing/unrestored; or add a
  repoint cooldown/timelock. Note repoint is admin-only and already blocked when counter > 0, so live risk
  is low today.
- **Status: ✅ RESOLVED.** `Position` now carries a `token: Address` captured at deposit; `withdraw`
  settles in `position.token`. `set_blend_token` is fail-closed — it reverts unless the pool holds zero
  token-denominated value (no open positions, `TotalRewardPool == 0`, `ProtocolFees == 0`), which
  eliminates both the TTL-counter bypass and token-accounting mixing.

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
- **Status: ✅ RESOLVED — merged to `dev`, validated on testnet.**
  - Implemented the exact-balance-delta assertion in `deposit_into_vault`: snapshot pool BLEND balance
    before/after the vault call, revert with new `VaultPulledUnexpectedAmount` unless it dropped by exactly
    `amount`.
  - Tests: `security_fixes.rs` — over-pull (replay) reverts; exact-pull succeeds. A mock hook
    (`test_set_extra_pull`) simulates the malicious replay. Full pool suite (110 tests) green.
  - **Testnet validation (2026-07): deployed the guarded WASM and ran deposit + withdraw of 5 USDC against
    the real DeFindex vault — both succeeded**, confirming the vault pulls exactly `amount` and the guard
    does not reject the legitimate path.
  - **Remaining:** ship to mainnet via the timelocked upgrade flow (propose → wait → execute) when ready.

---

## 🟡 BEHAVIOR/POLICY CHANGES — review, low risk

### P1. `add_lock_period` unbounded + no overflow bound
- Finding: `1d4e7d58` (LOW); ties into f620e7c9 (D/S1 below).
- Adding a `MAX_LOCK_PERIOD_SECS` cap (consistent with the existing "≤30 days" invariant documented in
  `positions.rs`) rejects periods an admin could previously add. Safe given current config uses ≤30d, but it
  removes an admin capability → flagged.
- **Status: ✅ DONE.** `MAX_LOCK_PERIOD_SECS = 30 days` enforced in `__constructor` (assert) and
  `add_lock_period` (`LockPeriodExceedsMax`). This makes the S1 `finalization_time` overflow
  unreachable (kept as defense-in-depth).

### P2. Badges: enforce a **minimum** upgrade timelock
- Finding part of `2ce344e3` (MED).
- Rejecting `timelock = 0` (or below a floor) removes admin flexibility and would be **inconsistent with the
  pool** (which allows 0). Recommend deciding a floor for BOTH contracts together, or neither.
- **Status: ✅ DONE.** `MIN_UPGRADE_TIMELOCK_SECS = 1 hour` enforced on **both** contracts
  (constructor assert + `update_upgrade_timelock_secs` → `UpgradeTimelockTooShort`), for consistency.

---

## Re-audit of the MEDIUM findings (requested)

All MEDIUMs are now resolved and none need further rework:
- `1e484c83` position-key squatting → D1 ✅ (owner-derived ids).
- `038e5c7a` token repoint bypass → D2 ✅ (per-position token + fail-closed guard).
- `2ce344e3` timelock reducible to 0 / unchecked add → S4 ✅ (checked add) + P2 ✅ (floor).
- `f620e7c9` finalization overflow → S1 ✅ (checked add) + P1 ✅ (cap makes it unreachable).
- `284b1ad9` badges lock not enforced at execute → S3 ✅.

## Cross-stack follow-up (Phase 2 — mostly DONE; verify at runtime)

Status: DB, contract deposit-event nonce, reconciliation decode, nonce endpoint,
and the web deposit/withdraw wiring are implemented and typecheck-clean (commits
5cb5d5d, 96b39da, 04e10d6, bec58d1). The web reads `deposit_id` from the
contract's `compute_deposit_id` view (not a client-side hash), so there is no
byte-layout to verify; `deposit_id_hex` is best-effort (nonce is what withdrawal
needs). **Remaining:** (a) end-to-end testnet deposit/withdraw smoke test; (b)
deploy config (below); (c) optional: reconciliation matcher by (wallet+nonce) as
a fallback when `deposit_id_hex` is empty. Original plan for reference:


The D1 signature change ripples beyond the contract. Before the new contract goes live, update:

**Nonce generation (the key design decision for the UI):** `deposit` takes a client-supplied
`nonce: u64`; the contract derives `id = sha256(caller ‖ nonce)`. Generate the nonce as a
**per-wallet monotonic counter kept off-chain** (in the DB): `next_nonce = MAX(nonce for that wallet) + 1`.
- Off-chain is the *right* home for the counter — unlike an on-chain counter it can't expire/reset, so it
  never collides. Monotonic + never-reused ⇒ `sha256(caller ‖ nonce)` is always fresh ⇒ `DepositAlreadyExists`
  never fires in normal use.
- **Concurrency:** two simultaneous deposits from the same wallet could compute the same `next_nonce`.
  Guard with a DB `UNIQUE(wallet_address, nonce)` constraint (+ retry with the next value), or serialize
  per-wallet. Low-frequency in practice, but design for it.
- **Withdrawal:** store each deposit's `nonce` so the client can call `withdraw(caller, nonce)` for the
  specific position. (Random `u64`/UUID also works and is collision-safe without a counter, but the
  per-wallet counter is cleaner to track and debug.)

Then:
- **DB** — add a `nonce` column to `deposits` (per deposit) with `UNIQUE(wallet_address, nonce)`; keep
  `deposit_id_hex` = the derived 32-byte id (hex) for event matching / reconcile keys.
- **apps/web** — deposit flow computes the next per-wallet nonce (via API/DB), passes `nonce: u64`;
  withdraw flow looks up the position's stored nonce. Use `compute_deposit_id` (or the deposit event) to
  confirm the id.
- **apps/api** — expose/compute the next nonce per wallet; update deposit/withdraw invoke construction.
- **apps/listener** + **apps/job-deposits** — event decoding: `deposit_id` is now `BytesN<32>` (hex),
  emitted in the deposit/withdraw events; persist alongside the wallet's `nonce`.
- The new contract's constructor now rejects lock periods > 30 days and timelock < 1 hour — set deploy
  config (`POOL_LOCK_PERIODS`, `POOL_UPGRADE_TIMELOCK_SECS`, badges timelock) accordingly.

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

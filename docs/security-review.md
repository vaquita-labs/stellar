# Vaquita — Internal Security Review (Soroban Contracts)

**Scope:** `contracts/vaquita-pool` + `contracts/vaquita-badges` (Soroban / Rust, `#![no_std]`, target `wasm32v1-none`)
**Review period:** 2026-07-27 → 2026-08-14
**Code state reviewed:** branch `dev` @ `603807a`
**Tools:** Almanax (AI-assisted review) · CoinFabrik Scout (`cargo-scout-audit` 0.3.16) · xycloo soroban-analyzer
**Verification:** every remediation claim below was re-checked against source on 2026-08-14; test suite and coverage re-run from a clean state.

---

## 1. Executive summary

| Metric | Result |
|---|---|
| Total findings across all three tools | **40** |
| — Almanax | 15 (1 HIGH · 5 MED · 8 LOW · 1 INFO) |
| — Scout | 21 |
| — soroban-analyzer | 4 |
| **Unresolved HIGH / Critical severity** | **0** |
| Resolved in code | 12 (one partial — see O1) |
| Accepted risk (test-only code) | 3 |
| Deliberate design, re-confirmed | 6 |
| Mitigated by build configuration | 5 |
| False positives | 8 |
| Real but non-exploitable (→ open items O2–O4) | 6 |

*(12 + 3 + 6 + 5 + 8 + 6 = 40.) §4 lists **7** open items: these 6 scanner findings consolidate into O2–O4, joined by O1 (found during this review) and O5–O7 (process/deployment).*

**Bottom line.** One HIGH-severity issue was found — a token-transfer replay vector on the deposit money-path (`02a02675`) — and it is fixed, tested, and reported validated on testnet. All five MEDIUM findings are fixed. No exploitable issue remains in either contract at the reviewed commit.

**Two caveats the reader must not skip:**

1. **"Resolved" here means resolved in source on `dev`.** It does not by itself mean the fixed WASM is live. Deployment status is tracked separately in §6 and must be filled in by the team before this report is treated as a statement about the running system.
2. **One scanner produced a false all-clear.** Scout's first run reported zero findings on both crates *and exited 0* while never having linted them. Details and the required CI mitigation are in §5.3.

---

## 2. Severity model

The three tools use different scales. This report normalises to the Almanax scale and preserves each tool's native label alongside it.

| Normalised | Almanax | Scout | Meaning used here |
|---|---|---|---|
| HIGH | HIGH | Critical | Funds at risk or protocol invariant breakable by an attacker |
| MEDIUM | MEDIUM | Medium | Governance/trust bypass, griefing, or a guard that can be circumvented |
| LOW | LOW | Minor | Hardening, robustness, or reachable only under admin error |
| INFO | INFO | Enhancement | Style, observability, dependency hygiene |

**Resolution status vocabulary:**

- **RESOLVED** — code changed; fix verified in source and covered by a test.
- **RESOLVED (partial)** — primary risk closed; a related residual remains, tracked in §4.
- **ACCEPTED** — no code change; risk consciously accepted with stated justification.
- **NOT A DEFECT** — analysed and determined to be a false positive.

---

## 3. Almanax findings — 15 total

**1 HIGH · 5 MEDIUM · 8 LOW · 1 INFO. All closed: 12 RESOLVED, 3 ACCEPTED.**

### 3.1 HIGH

#### `02a02675` — Vault can replay authorized token transfer · **RESOLVED**

`vault_adapter.rs :: deposit_into_vault`

`env.authorize_as_current_contract` entries are **not single-use**. The pool pre-authorised `blend_token.transfer(pool → vault, amount)` and then called into the external DeFindex vault. A malicious or compromised vault could match that same authorization repeatedly within one invocation tree and pull multiples of `amount` out of the pool's *existing* BLEND balance (reward pool + protocol fees), breaking solvency while the deposit still appeared to succeed.

This was the most serious finding in the review: it sits directly on the core deposit money-path.

**Fix** — exact balance-delta enforcement around the vault call (`vault_adapter.rs:23-59`):

```rust
let pool_blend_before = blend_client.balance(&contract_address);
// … authorize_as_current_contract + defindex_vault_client.deposit(…) …
let pool_blend_after = blend_client.balance(&contract_address);
let pulled = arithmetic::checked_sub(pool_blend_before, pool_blend_after)?;
if pulled != amount {
    return Err(VaquitaPoolError::VaultPulledUnexpectedAmount);
}
```

The pool must have parted with **exactly** `amount` — no more (replay pull), no less (partial/no pull). This caps total pullable funds at `amount` regardless of how many times the vault replays the entry.

**Verification**
- Source confirmed at `vault_adapter.rs:53-59`; new error variant `VaultPulledUnexpectedAmount = 26`.
- Tests in `vaquita-pool/src/test/security_fixes.rs`: over-pull (simulated replay via a `test_set_extra_pull` mock hook) reverts; exact-pull succeeds.
- **Team-reported** (not independently reproduced in this review): the guarded WASM was deployed to testnet in 2026-07 and a 5 USDC deposit + withdraw against the **real** DeFindex vault both succeeded — confirming the real vault pulls exactly `amount` and the guard does not reject the legitimate path. This validation matters because an over-strict assertion here would revert *all* deposits.

### 3.2 MEDIUM — 5 findings, all RESOLVED

| ID | Title | File | Fix | Status |
|---|---|---|---|---|
| `284b1ad9` | Upgrade lock does not block execution | `badges/upgrade.rs` | `UpgradesLocked` now checked in `execute_upgrade`, not only `propose_upgrade` — brings badges to parity with pool | **RESOLVED** |
| `1e484c83` | Position key not bound to owner | `pool/types.rs` | Key changed to `Positions(BytesN<32>)` where the id is contract-derived | **RESOLVED** |
| `038e5c7a` | Token repoint guard bypassable after TTL expiry | `pool/token_config.rs` | Per-position `token` + fail-closed repoint guard | **RESOLVED** |
| `2ce344e3` | Admin can reduce timelock for instant upgrades | `badges/lib.rs` | `MIN_TIMELOCK_SECS = 1h` floor + `checked_add` on `ready_at` | **RESOLVED** |
| `f620e7c9` | Lock finalization timestamp can overflow | `pool/lib.rs` | `checked_add` on `timestamp + period` | **RESOLVED** |

**`284b1ad9`** — An admin (or compromised admin key) could `propose_upgrade`, then call `lock_upgrades_forever` to publicly signal upgrades were disabled, and *still* execute the pending upgrade after the timelock. Anyone treating the lock event as a hard guarantee would have been misled. Now `execute_upgrade` re-checks the flag (`badges/upgrade.rs:75-82`) and returns `UpgradeLocked`. Covered by `lock_forever_blocks_execute`.

**`1e484c83` / `b1daf512` / `60b2e092`** (one root cause, three reports) — `deposit_id` was a caller-supplied `String` used as the sole storage key, enforcing only global uniqueness. A third party could front-run a victim's deposit with the same id and permanently block it (`DepositAlreadyExists`), and unbounded-length ids allowed persistent-state bloat.

The contract now derives the id itself:

```rust
fn derive_id(env: &Env, caller: &Address, nonce: u64) -> BytesN<32> {
    let mut preimage = Bytes::new(env);
    preimage.append(&caller.clone().to_xdr(env));
    preimage.append(&Bytes::from_array(env, &nonce.to_be_bytes()));
    env.crypto().sha256(&preimage).to_bytes()
}
```

`deposit`/`withdraw` take `nonce: u64` instead of a free-form string. Because the id is a function of the caller's address, squatting is cryptographically infeasible, and the fixed 32-byte key removes the state-bloat vector. A pleasing secondary effect: the separate `NotOwner` check in `withdraw` became redundant and was removed — a wrong caller simply derives a different id and gets `PositionNotFound`. `compute_deposit_id` is exposed as a view so off-chain code can match events.

> ⚠️ **This changed the public contract ABI.** See §6 for the cross-stack migration status.

**`038e5c7a`** — `set_blend_token` was guarded only by `positions::outstanding_count()`, which reads an **instance-storage** counter with `unwrap_or(0)`. If that entry expired/was archived while persistent position entries survived (or were restored independently), the counter would read 0 and the guard would wave the repoint through, stranding depositors whose positions were opened under the old token.

Fixed on two axes: `Position` now carries `token: Address` captured at deposit, and `withdraw` settles in `position.token` — so a repoint can no longer strand anyone. Additionally `set_blend_token` is now **fail-closed**, reverting unless the pool holds zero token-denominated value:

```rust
if crate::positions::outstanding_count(env) > 0 || reward_pool > 0 || protocol_fees > 0 {
    return Err(VaquitaPoolError::TokenRepointHasOutstandingPositions);
}
```

**`2ce344e3`** — The upgrade timelock could be set to `0`, letting an admin propose and execute an upgrade in the same transaction and defeating the delay users rely on to exit. A `MIN_TIMELOCK_SECS = 1 hour` floor is now enforced on **both** contracts (constructor assert + `update_upgrade_timelock_secs` → `UpgradeTimelockTooShort`), and `ready_at` uses `checked_add` so a huge timelock cannot wrap into the past. Both contracts were changed together deliberately — a floor on one and not the other would be an inconsistency an operator could trip over.

**`f620e7c9`** — `finalization_time = timestamp + period` was unchecked. With a sufficiently large supported period the sum could wrap, producing a maturity date in the past and making a position instantly withdrawable on the matured path — draining the period's reward pool in a deposit/withdraw loop. Now `checked_add(...).ok_or(ArithmeticOverflow)?` (`pool/lib.rs:150-154`), backed by the `MAX_LOCK_PERIOD_SECS` bound from `1d4e7d58` which makes the overflow unreachable in the first place. Kept as defence-in-depth.

### 3.3 LOW — 8 findings

| ID | Title | File | Status |
|---|---|---|---|
| `23c95cf8` | Untrusted JSON fields printed to terminal | `scripts/print_coverage_summary.py` | **RESOLVED** |
| `565f1c37` | Unchecked additions wrap upgrade timing/version | `badges/upgrade.rs` | **RESOLVED** |
| `95153d60` | Unchecked vault return can trap withdrawals | `pool/vault_adapter.rs` | **RESOLVED** |
| `1d4e7d58` | Admin can add unsafe lock periods without bounds | `pool/lib.rs` | **RESOLVED (partial)** → O1 |
| `b1daf512` | User-controlled deposit IDs enable squatting | `pool/positions.rs` | **RESOLVED** (see `1e484c83`) |
| `60b2e092` | Unbounded persistent position keys → state bloat | `pool/lib.rs` | **RESOLVED** (see `1e484c83`) |
| `b9ff40ec` | Unprotected test hooks allow state manipulation | `test/mock_defindex_vault.rs` | **ACCEPTED** |
| `03dfadaa` | Anyone can force withdrawals for any address | `test/mock_defindex_vault.rs` | **ACCEPTED** |

**`95153d60`** — `withdraw_from_vault` used `get_unchecked(0)` on vectors returned by the external vault. An empty return (misconfiguration, interface drift, or a malicious vault) would trap, freezing withdrawals — and repointing the vault is blocked while positions are open, so recovery would be awkward. Both call sites now use `get(0).ok_or(VaultReturnedNoAmounts)?`, converting a panic into a controlled error. Covered by a mock returning an empty vector.

**`565f1c37`** — `ready_at = timestamp + timelock` and `new_version = version + 1` were unchecked. Now `checked_add` (returning `ArithmeticOverflow`) and `saturating_add` respectively.

**`23c95cf8`** — A crafted filename in coverage JSON could inject ANSI escape sequences into CI logs (log forging / hiding output). Now stripped via `re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")` before printing. Not a contract issue; included for completeness.

**`1d4e7d58`** — `add_lock_period` accepted any `u64`, enabling both the `f620e7c9` overflow and periods exceeding TTL assumptions. `MAX_LOCK_PERIOD_SECS` is now enforced in `__constructor` and `add_lock_period` (`LockPeriodExceedsMax`). Marked **partial** because the bound was subsequently raised to 2 years, which reopens a TTL concern — see **O1** in §4.

### 3.4 INFO / test-only — ACCEPTED

`b9ff40ec`, `03dfadaa`, `2eaffbf0` all target `test/mock_defindex_vault.rs`: unauthenticated `test_*` state hooks, a `withdraw` with no `require_auth`, and `get_unchecked` on caller-supplied vectors.

**Accepted, not fixed.** The file is gated by `#![cfg(test)]` at line 1 and is excluded from the coverage regex, so it is never compiled into a deployable artifact. The hooks exist precisely to simulate malicious vault behaviour — including the replay used to test the `02a02675` fix. Adding `require_auth` to the mock's `withdraw` would break the tests that call it directly.

Mitigation applied: an explicit header comment now marks the file, so the gating is not merely implicit:

```rust
#![cfg(test)]
//! TEST ONLY — never deploy. The `test_*` hooks below intentionally mutate
//! state without auth to simulate broken/malicious vault behavior …
```

**Standing action:** any future refactor that moves this file must preserve the `#![cfg(test)]` gate.

---

## 4. Open items — 7

None are exploitable. Listed so nothing is silently dropped.

| # | Item | Severity | Source |
|---|---|---|---|
| **O1** | Lock-period ceiling (2 y) exceeds position TTL (~90 d) | LOW | This review |
| **O2** | `soroban-sdk` five major versions behind | INFO | Scout |
| **O3** | `update_upgrade_timelock_secs` emits no event (both contracts) | INFO | Scout |
| **O4** | DeFindex vault WASM provenance record is untracked/incomplete | INFO | Scout + this review |
| **O5** | Fixed WASM not confirmed deployed | — | This review (§6) |
| **O6** | Phase-2 cross-stack migration not fully validated | — | Team checklist |
| **O7** | Scout can report a false all-clear in CI | — | This review (§5.3) |

### O1 — Lock-period ceiling exceeds position TTL

`MAX_LOCK_PERIOD_SECS` is **2 years** (`pool/lib.rs:34`, raised in commit `990711a`), while `POSITION_TTL_EXTEND_TO` is ≈90 days (`positions.rs:27`) against a network maximum entry TTL of ~180 days.

A position with a lock longer than ~90 days will therefore **archive before it matures** unless someone touches it. Funds are not lost — the entry can be restored on demand, and `refresh_position_ttl` is public and permissionless so anyone can bump it — but withdrawal at maturity may require an extra restore step that the current frontend does not perform. `positions.rs:24-26` acknowledges this explicitly as deferred archival-recovery work.

**This is latent, not live:** it only bites if a lock period longer than ~90 days is actually configured. Whether that is true depends on deploy config (`POOL_LOCK_PERIODS`), which is not asserted anywhere in the contract.

**Documentation defect found alongside it:** `docs/contracts-security-findings-checklist.md` (item P1) still states the cap is **30 days**. The code says 2 years. Anyone reading the checklist to reason about TTL safety will reach the wrong conclusion. **Fix the doc regardless of what is decided about the cap.**

Recommended: either keep the cap aligned with the TTL policy, or add explicit archival-recovery handling (restore-then-withdraw) before enabling any period > 90 days.

### O2 — `soroban-sdk` 22.0.3 → 27.0.6

`contracts/Cargo.toml:17` pins `22.0.3` (resolving to 22.0.11); latest published is **27.0.6**. Five majors of drift on the SDK that mediates all storage, TTL, auth, and crypto semantics. This is a deliberate project with breaking changes and a required re-audit of storage/TTL behaviour — it should be *planned*, not done casually, but it should be planned. It also interacts with O4 and the `wasm32v1-none` target.

### O3 — Missing event on timelock change

Both `pool/upgrade.rs:127-141` and `badges/upgrade.rs:123-133` write `DataKey::UpgradeTimelockSecs` and emit **no event**, while sibling admin operations in the same modules do. Changing an upgrade timelock is a security-relevant governance action that off-chain monitors currently cannot observe. Small, clearly correct fix; consistent with the repo's own stated goal that admin functions emit events.

### O4 — DeFindex WASM provenance

`pool/defindex_vault.rs` uses `contractimport!` on a vendored binary. Better than scout implied — the WASM **is** committed, and its SHA-256 matches the documented value (verified: `f345228d…16be`). Two gaps remain:

1. The `README.md` recording that provenance is **untracked** (still showing as `??` in git status), so the record itself isn't in the repo.
2. The source commit field is a placeholder: *"(see git log for the commit that introduced this file)"* — there is no pinned upstream revision.

Fix: commit the README and record the actual upstream commit hash.

---

## 5. Scout and soroban-analyzer

### 5.1 Scout — 21 findings

7 Critical, 5 Medium, 1 Minor, 8 Enhancement (scout's labels). After triage: **0 exploitable** — 6 legitimate improvements, 6 deliberate design decisions, 5 mitigated by build configuration, 4 false positives.

| Detector | Scout severity | Count | Verdict |
|---|---|---:|---|
| `unprotected-update-current-contract-wasm` | Critical | 2 | ❌ NOT A DEFECT — auth is interprocedural via `require_owner`, plus two-phase timelock |
| `integer-overflow-or-underflow` | Critical | 5 | ⚠️ Mitigated — `overflow-checks = true` makes these panic, not wrap |
| `contract-import-dependency` | Medium | 2 | ✅ Real → **O4** |
| `ineffective-extend-ttl` | Medium | 2 | ⚠️ Deliberate — badges must never expire; a fee cost, not a bug |
| `unsafe-unwrap` | Medium | 1 | ❌ NOT A DEFECT — guarded by a `has()` check four lines above |
| `soroban-version` | Enhancement | 2 | ✅ Real → **O2** |
| `storage-change-events` | Enhancement | 2 | ✅ Real → **O3** |
| `assert-violation` | Enhancement | 4 | ⚠️ Deliberate — constructor arg validation; Soroban constructors cannot return `Result` |
| `unused-return-enum` | Minor | 1 | ❌ NOT A DEFECT — soulbound `transfer` must always reject |

The five `integer-overflow-or-underflow` hits deserve a note, since "5 Critical" reads alarmingly. The detector's stated risk is *silent wrapping producing an inexact result* — **that failure mode does not exist in this build**: `contracts/Cargo.toml:21` sets `overflow-checks = true` on the release profile, so an overflow panics and reverts. All five are monotonic counters requiring 2³²/2⁶⁴ operations to reach their bound. Converting them to `checked_add`/`saturating_add` is defensible consistency work, not a security fix.

Full detail: `docs/scout-soroban-report.md`.

### 5.2 soroban-analyzer — 4 findings, 0 true positives

A **gas-inefficiency linter**, not a security scanner — two detectors only (storage access in loops; repeated storage-touching calls in a block). All 4 findings are name-collision false positives: the tool matches call sites by bare method name and attributed `env.storage().instance().get()/set()` to the module-level `positions::get`/`positions::set`. The two flagged functions operate on **distinct keys** (`PositionCount`, `PositionCountForPeriod`), so there is no read to cache.

Neither contract triggered the storage-in-loop detector — the more valuable of the two checks.

The tool is unmaintained (last commit 2023-01-16), its project-wide `--all` mode is broken, and it cannot distinguish `#[cfg(test)]` code from production. **Recommendation: do not adopt into CI.** Full detail: `docs/soroban-analyzer-report.md`.

### 5.3 ⚠️ Scanner reliability — a false all-clear

**Scout's first run on this workspace reported `Analyzed | 0 | 0 | 0 | 0` for both crates and exited 0 — having never linted them.**

The `dylint_driver` build script clones `rust-lang/rust-clippy`; that clone failed on a transient network error:

```
error: failed to run custom build command for `dylint_driver v4.1.2`
  error: RPC failed; curl 92 HTTP/2 stream 5 was not closed cleanly: CANCEL (err 8)
```

Scout still printed a clean summary table and returned success. The only mention of `vaquita_*` anywhere in that run's log was the summary table itself. Re-running with HTTP/1.1 forced produced the 21 findings above.

**How to distinguish a real run:** genuine output contains

```
Checking vaquita-badges v0.0.0 (/…/contracts/vaquita-badges)
Checking vaquita-pool v0.0.0 (/…/contracts/vaquita-pool)
```

**If scout is added to CI, the gate must assert those lines appear rather than trusting the exit code.** Without that check, a network blip silently turns the security gate green — worse than not running the tool at all. Note also that a first run costs ~45–60 min, so toolchain/detector caching is a prerequisite for per-PR use.

---

## 6. Deployment status — must be completed before sign-off

Everything in §3 is verified **in source on `dev` @ `603807a`**. That is a statement about the code, not about the running system.

| Question | Status |
|---|---|
| Fixes merged to `dev` | ✅ Yes — verified |
| Fixes validated on testnet | ✅ Team-reported (HIGH `02a02675`, 2026-07) |
| Fixed WASM live on mainnet | ⬜ **To be confirmed by the team** |
| Cross-stack (Phase 2) migration complete | ⚠️ Partial — see below |

**Why this matters.** The `1e484c83` fix changed the public ABI: `deposit`/`withdraw` take `nonce: u64` instead of `deposit_id: String`. Per the team checklist, the DB nonce column, contract deposit-event nonce, reconciliation decode, nonce endpoint, and web deposit/withdraw wiring are implemented and typecheck-clean (commits `5cb5d5d`, `96b39da`, `04e10d6`, `bec58d1`). **Outstanding:** an end-to-end testnet deposit/withdraw smoke test, deploy config (`POOL_LOCK_PERIODS`, `POOL_UPGRADE_TIMELOCK_SECS`, badges timelock — note the constructor now *rejects* out-of-bounds values), and optionally a reconciliation matcher keyed on `(wallet, nonce)` as a fallback when `deposit_id_hex` is empty.

If mainnet still runs a pre-fix WASM, ship via the timelocked upgrade flow: `propose_upgrade` → wait ≥ timelock → `execute_upgrade` (runbook: `docs/vaquita-pool-upgrade-runbook.md`).

---

## 7. Verification evidence

Re-run from a clean state on 2026-08-14 against `dev` @ `603807a`:

```
$ cargo test --workspace
   vaquita_badges: test result: ok. 57 passed; 0 failed
   vaquita_pool:   test result: ok. 112 passed; 0 failed
   → 169 tests, 0 failures

$ make coverage
   TOTAL  Functions: 97/97      (100.00%)
          Lines:     1206/1210  (99.67%)
          Regions:   1877/1956  (95.96%)
```

CI gate is `--fail-under-lines 80` (Codecov `contracts` flag, 80% threshold); actual coverage far exceeds it.

The ~4% uncovered regions are **unreachable defensive branches**: the `?` arms of `checked_add/sub/mul/div` (i128 overflow that realistic values cannot reach) and `.ok_or(NotInitialized)?` arms (`Admin`/`BlendToken` are always set at construction). Covering them would require corrupting storage through a path the public API does not expose, or deleting the guards. These are intentional defensive code and should be accepted rather than chased.

Tests added specifically for these findings:
- `pool/test/security_fixes.rs` — vault replay over-pull revert; `finalization_time` overflow revert; empty-preview and empty-withdraw reverts
- `pool/test/coverage_gaps.rs` — `refresh_position_ttl`, zero-deposit reward branch, early-withdrawal fee path
- `badges/test/upgrade_pause_test.rs` — execute-after-lock revert; timelock-overflow revert
- `pool/test/conservation.rs` — `property_solvency_holds_over_random_sequences`

---

## 8. Security architecture notes

Properties relied upon by the analysis above, recorded so a future reviewer can check they still hold. Full system architecture: `docs/architecture.md`.

**Authorization.** Every admin entry point routes through `admin::require_owner`, which loads the stored `Admin` address and calls `.require_auth()`. User entry points use `require_auth_for_args` binding the *exact* arguments — `deposit` binds `(caller, nonce, amount, period)` — so a signature cannot be replayed with different values.

**Upgrade governance.** Both contracts implement two-phase timelocked upgrades: `propose_upgrade` → wait ≥ `UpgradeTimelockSecs` (floor 1 h, default 48 h) → `execute_upgrade`, with `cancel_upgrade` and an irreversible `lock_upgrades_forever`. Post-`284b1ad9`, the lock is enforced at **both** propose and execute.

**Solvency invariant.** `accounting::assert_solvent` enforces `balance(BLEND) ≥ total_reward_pool + protocol_fees` before every outbound transfer. Principal is held as vault shares, not directly, so only reward and fee balances are checked. Backed by a randomised property test.

**Arithmetic.** `overflow-checks = true` on the release profile (panic rather than wrap) *plus* explicit `checked_*` helpers in `arithmetic.rs` on all value-bearing paths. Belt and braces, deliberately.

**Pause.** Both contracts carry an admin pause; `deposit` is gated by `pause::require_not_paused`. **Note by design:** `withdraw` is *not* pause-gated — users can always exit. That is the correct trade-off and is called out here so it is not mistaken for an oversight.

**Storage tiering.** Positions live in **persistent** storage (individually archivable/restorable, own TTL); admin config and bounded per-period maps live in **instance** storage. The `038e5c7a` finding is the cautionary tale for why a security guard must never depend solely on an expirable instance entry.

---

## 9. Reviewer sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Contract author / remediation | Fabio Laura | 2026-08-17 | ✅ Signed — Fabio Laura |
| Independent cross-review | Oscar | | ⬜ Pending |

**Fabio Laura, 2026-08-17.** I authored the remediations recorded in §3 and confirm that, to the best of my knowledge, the findings are addressed as described, the verification evidence in §7 is accurate, and the open items in §4 are complete and correctly characterised.

> Deliverable 3.5 specifies manual cross-review between Fabio and Oscar in addition to the tooling. The independent cross-review row remains open: it records human review that is **not** evidenced by anything in this repository, and it must be completed by the named reviewer. A sign-off from the remediation author alone does not satisfy the cross-review requirement.

---

## 10. Appendix — finding index

| ID | Sev | Component | Status |
|---|---|---|---|
| `02a02675` | HIGH | pool / vault_adapter | RESOLVED |
| `284b1ad9` | MED | badges / upgrade | RESOLVED |
| `1e484c83` | MED | pool / types | RESOLVED |
| `038e5c7a` | MED | pool / token_config | RESOLVED |
| `2ce344e3` | MED | badges / lib | RESOLVED |
| `f620e7c9` | MED | pool / lib | RESOLVED |
| `23c95cf8` | LOW | scripts | RESOLVED |
| `565f1c37` | LOW | badges / upgrade | RESOLVED |
| `95153d60` | LOW | pool / vault_adapter | RESOLVED |
| `1d4e7d58` | LOW | pool / lib | RESOLVED (partial → O1) |
| `b1daf512` | LOW | pool / positions | RESOLVED |
| `60b2e092` | LOW | pool / lib | RESOLVED |
| `b9ff40ec` | LOW | pool / test mock | ACCEPTED |
| `03dfadaa` | LOW | pool / test mock | ACCEPTED |
| `2eaffbf0` | INFO | pool / test mock | ACCEPTED |
| Scout ×21 | mixed | both | 6 real (→ O2/O3/O4) · 6 deliberate · 5 mitigated · 4 NOT A DEFECT |
| soroban-analyzer ×4 | — | pool / positions | NOT A DEFECT |

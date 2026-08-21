# soroban-analyzer Report — `vaquita-pool` + `vaquita-badges`

**Date:** 2026-08-14
**Tool:** [xycloo/soroban-analyzer](https://github.com/xycloo/soroban-analyzer) @ `11edc8d` (last upstream commit 2023-01-16)
**Toolchain:** rustc 1.95.0 / cargo 1.95.0 (darwin arm64)
**Scope:** all 40 `.rs` files under `contracts/vaquita-pool/src` and `contracts/vaquita-badges/src`
**Result:** 4 raw findings, **0 true positives**. No action required.

---

## What this tool is (and is not)

soroban-analyzer is a **gas-inefficiency linter**, not a security scanner. It has exactly two detectors:

1. Loops that indirectly read or write contract storage.
2. Functions that indirectly access contract storage and are called multiple times within the same block.

It finds neither vulnerabilities nor correctness bugs. For security coverage see `docs/scout-soroban-report.md` and `docs/contracts-security-findings-checklist.md`.

The tool is **unmaintained** — last commit January 2023, 1 GitHub star, never published to crates.io, and its own README carries the disclaimer *"Unstable, still under development, the tool's scope is currently very limited, expect bugs."* It predates Soroban mainnet and the storage-tiering API (`.instance()` / `.persistent()` / `.temporary()`). It still builds and runs against a modern toolchain, but see the accuracy caveats below.

## Reproducing this run

```bash
git clone https://github.com/xycloo/soroban-analyzer
cd soroban-analyzer && cargo build -p soroban-analyzer --release   # ~73s, 5 warnings, no errors
```

**Do not use the README's `--all` flag** — it panics on any cargo project:

```
thread 'main' panicked at soroban-analyzer/src/metric.rs:7:43:
called `Result::unwrap()` on an `Err` value: Os { code: 2, kind: NotFound }
```

The walker at `soroban-analyzer/src/main.rs:60` builds its path from `entry.file_name()`, which is the **basename only**, so it tries to open `lib.rs` rather than `src/lib.rs`. It only works when every `.rs` file sits directly in the working directory. Drive it per-file instead:

```bash
cd contracts
ANALYZER=/path/to/soroban-analyzer/target/release/soroban-analyzer
for f in $(find vaquita-pool/src vaquita-badges/src -name '*.rs' | sort); do
  echo "=== $f ==="; "$ANALYZER" --p "$f"
done
```

## Findings

All four are in `contracts/vaquita-pool/src/positions.rs`:

| # | Location | Reported | Verdict |
|---|----------|----------|---------|
| 1 | `positions.rs:100-118` (`increment_count`) | `get` (line 34) accesses state and is used multiple times in the block | **False positive** |
| 2 | `positions.rs:100-118` (`increment_count`) | `set` (line 41) accesses state and is used multiple times in the block | **False positive** |
| 3 | `positions.rs:120-139` (`decrement_count`) | `get` (line 34) accesses state and is used multiple times in the block | **False positive** |
| 4 | `positions.rs:120-139` (`decrement_count`) | `set` (line 41) accesses state and is used multiple times in the block | **False positive** |

### Why all four are false positives

The analyzer matches call sites by **bare method name**. The `get`/`set` calls inside `increment_count` and `decrement_count` are `env.storage().instance().get(...)` / `.set(...)` — the Soroban SDK's `Storage` methods. The analyzer attributed them to the module-level `positions::get` (line 34) and `positions::set` (line 41), which are never called from either function.

There is also no underlying inefficiency to salvage from the report. Each function performs one read and one write against **two distinct keys**:

- `DataKey::PositionCount` (global counter)
- `DataKey::PositionCountForPeriod(period)` (per-period counter)

Distinct keys cannot be collapsed into a single cached read, so the suggestion to "use `get` once and save it in memory" does not apply. The current code is already minimal for what it does.

### Note on `test_corrupt_total_principal`

The tool's debug listing reports `test_corrupt_total_principal at line 594` among the state-accessing functions in `vaquita-pool/src/lib.rs`, which looks alarming in raw output. It is **`#[cfg(test)]`-gated** and is not present in the deployed WASM. The analyzer parses source text without evaluating `cfg` attributes, so test-only code appears indistinguishable from production entry points throughout its output.

## Coverage observed

The state-access pass did resolve correctly against the modern SDK — it identified 83 state-touching functions across 16 files, including every public entry point on both contracts:

| File | State-accessing fns |
|------|--------------------:|
| `vaquita-pool/src/test/mock_defindex_vault.rs` | 12 |
| `vaquita-pool/src/positions.rs` | 10 |
| `vaquita-pool/src/lib.rs` | 10 |
| `vaquita-badges/src/lib.rs` | 8 |
| `vaquita-badges/src/test/types_test.rs` | 7 |
| `vaquita-pool/src/upgrade.rs` | 6 |
| `vaquita-badges/src/upgrade.rs` | 6 |
| `vaquita-pool/src/accounting.rs` | 5 |
| `vaquita-pool/src/pause.rs` | 4 |
| `vaquita-badges/src/pause.rs` | 4 |
| `vaquita-pool/src/test/mod.rs` | 3 |
| `vaquita-pool/src/token_config.rs` | 2 |
| `vaquita-badges/src/storage.rs` | 2 |
| `vaquita-badges/src/admin.rs` | 2 |
| `vaquita-pool/src/vault_adapter.rs` | 1 |
| `vaquita-pool/src/admin.rs` | 1 |

Neither contract triggered the storage-in-loop detector, which is the more valuable of the two checks — no loop in either contract reads or writes storage per iteration.

## Recommendation

**Do not adopt this tool into CI.** Its entire output on this codebase is four name-collision false positives, its project-wide mode is broken, it cannot distinguish test code from production code, and it has been unmaintained for over three years. The one-off run documented here is sufficient; there is no reason to re-run it unless the contracts gain storage-touching loops, which the detector would catch but which are also obvious in review.

Gas/resource work on these contracts is better served by Soroban's own budget instrumentation (`env.cost_estimate().budget()` in tests) than by this analyzer.

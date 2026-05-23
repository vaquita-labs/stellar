# Contracts

[![Contracts CI](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml/badge.svg?branch=main)](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml)

Soroban workspace with the Vaquita contracts (`vaquita-pool` and related crates).

## Requirements

- **Rust** stable, with the `wasm32v1-none` target:
  ```bash
  rustup target add wasm32v1-none
  ```
- **Stellar CLI** — see [Stellar developer tools](https://developers.stellar.org/docs/tools/developer-tools).
- For coverage: `cargo install cargo-llvm-cov --locked` and `llvm-tools-preview`.

## Tests

From `contracts/`:

```bash
cargo test --workspace
# or
make test
```

## Build the WASM

```bash
cd vaquita-pool
stellar contract build
```

## Local coverage

`cargo-llvm-cov` generates reports from the Rust tests.

```bash
# 1. Install the tool once
cargo install cargo-llvm-cov --locked

# 2. Generate coverage from contracts/
make coverage
```

Generated files:

- `contracts/lcov.info` — LCOV report
- `contracts/coverage-html/` — HTML report
- Terminal — after the HTML step, `make coverage` prints function / line / region percentages (same as the HTML summary table)

Open the HTML report (LLVM writes it under `coverage-html/html/`):

```bash
open contracts/coverage-html/html/index.html
```

## Deployed contract

[Vaquita Pool on Soroban testnet](https://lab.stellar.org/r/testnet/contract/CDKCKHTRKFJXVKLICHPIXAPLIVDRBDQEEGJYDKFOTUV35APVNOGTWZW7)

## Integrations

- [Blend USDC](https://github.com/blend-capital/blend-utils/blob/main/testnet.contracts.json)
- [DeFindex USDC_blend_strategy](https://github.com/paltalabs/defindex/blob/main/public/testnet.contracts.json)

> Re-check after each testnet reset, addresses change.

## CI

Workflow: [`.github/workflows/contracts-ci.yml`](../.github/workflows/contracts-ci.yml).

On every push/PR that touches `contracts/**`:

- `cargo test`
- `stellar contract build` (sanity build)
- `cargo llvm-cov` (coverage)

Uploaded artifacts:

- `contracts-lcov`
- `contracts-coverage-html`

Download them from the workflow run page. Coverage is also published on [Codecov](https://app.codecov.io/gh/vaquita-labs/stellar).

### Configuration notes

- **Upload auth:** the *Contracts Coverage* job needs `CODECOV_TOKEN` in the repo secrets to upload `contracts/lcov.info` ([docs](https://docs.codecov.com/docs/adding-the-codecov-token)).
- **Badge for private repos:** the SVG URL needs a `token` query param distinct from the upload token. Get it from *Badges & Graphs* in the Codecov repo settings ([docs](https://docs.codecov.com/docs/status-badges)).
- **Coverage threshold:** 80% on project/patch, configured in [`codecov.yml`](../codecov.yml) with a `contracts` flag and a component scoped to `contracts/`.
- **Stellar CLI in CI:** installed from the [official release](https://github.com/stellar/stellar-cli/releases) (version pinned via `STELLAR_CLI_VERSION` in the workflow) instead of compiling with Cargo, to avoid native deps (`hidapi`, `libudev`, `dbus`) and keep the job fast.

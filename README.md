# Stellar

Monorepo for Vaquita on Stellar: Soroban smart contracts, deployment tooling, and related apps.

[![Contracts CI](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml/badge.svg?branch=main)](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml)
[![codecov](https://codecov.io/github/vaquita-labs/stellar/graph/badge.svg?token=O645YJTLJ2)](https://codecov.io/github/vaquita-labs/stellar)

## Repository layout

| Path | Description |
|------|-------------|
| [`contracts/`](contracts/) | Soroban workspace (`vaquita-pool` and related crates). Tests, WASM build, coverage. |
| [`apps/deployer/`](apps/deployer/) | TypeScript deployer: DeFindex vault creation via API, local XDR signing, Doppler integration. |
| [`apps/web/`](apps/web/) | Next.js frontend (see its README). |
| [`apps/back/`](apps/back/) | Backend API (see its README when present). |

## Prerequisites

- **Rust** (stable), with `wasm32v1-none` target for contract builds  
  `rustup target add wasm32v1-none`
- **Stellar CLI** (for building and invoking contracts) — see [Stellar docs](https://developers.stellar.org/docs/tools/developer-tools)
- **Node.js** 20+ (for `apps/deployer`; pnpm via Corepack is fine)

## Contracts: quick start

From the repo root:

```bash
cd contracts
cargo test --workspace
```

Build the pool contract WASM:

```bash
cd contracts/vaquita-pool
stellar contract build
```

Coverage (requires `cargo install cargo-llvm-cov --locked` and `llvm-tools-preview`):

```bash
cd contracts
make coverage
```

More detail: [contracts/README.md](contracts/README.md).

## Deployer (vault API)

```bash
cd apps/deployer
pnpm install
# Configure env (see apps/deployer/.env.example), then:
pnpm deploy:vault
```

See [apps/deployer/README.md](apps/deployer/README.md).

## CI

Contract tests, WASM build, and coverage artifacts are run by [`.github/workflows/contracts-ci.yml`](.github/workflows/contracts-ci.yml) when `contracts/**` changes. Download `lcov` and HTML reports from the workflow run’s **Artifacts** section.

The coverage badge reads from [Codecov](https://app.codecov.io/gh/vaquita-labs/stellar).

- Upload auth: the **Contracts Coverage** job needs `CODECOV_TOKEN` set in repo secrets to upload `contracts/lcov.info` (see [Codecov docs](https://docs.codecov.com/docs/adding-the-codecov-token)).
- Private-repo badge: the SVG URL requires a badge `token` query parameter (distinct from the upload token). Grab it from the **Badges & Graphs** section of the Codecov repo settings and replace `CODECOV_BADGE_TOKEN` in this README with the actual value (see [status-badges docs](https://docs.codecov.com/docs/status-badges)).
- Coverage thresholds: enforced via [`codecov.yml`](codecov.yml) — **80%** target on project/patch, with a dedicated `contracts` flag + component scoped to `contracts/`.

The **Contracts Build** job installs the Stellar CLI from the official [GitHub release](https://github.com/stellar/stellar-cli/releases) tarball (same version as `STELLAR_CLI_VERSION` in the workflow) instead of compiling with Cargo, so CI stays fast and avoids native `hidapi` / `libudev` / `dbus` build dependencies.

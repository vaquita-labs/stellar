# Stellar

Monorepo for Vaquita on Stellar: Soroban smart contracts, deployment tooling, and related apps.

[![Contracts CI](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml/badge.svg?branch=main)](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml)
[![contracts coverage](https://img.shields.io/codecov/c/github/vaquita-labs/stellar?label=contracts%20coverage)](https://app.codecov.io/gh/vaquita-labs/stellar)

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

The coverage badge reads from [Codecov](https://app.codecov.io/gh/vaquita-labs/stellar) after you add this repository there once (uploads use OIDC from the **Contracts Coverage** job).

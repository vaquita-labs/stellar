# Vaquita Stellar

Vaquita monorepo on Stellar: frontend, API, services, and Soroban contracts.

[![Contracts CI](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml/badge.svg?branch=main)](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml)
[![codecov](https://codecov.io/github/vaquita-labs/stellar/graph/badge.svg?token=O645YJTLJ2)](https://codecov.io/github/vaquita-labs/stellar)

## Requirements

- Node.js 20+
- pnpm 10+ (`corepack enable`)

## Install

```bash
pnpm install
```

## Run the apps

```bash
pnpm dev:web        # Next.js frontend  → http://localhost:3101
pnpm dev:api        # Express API       → http://localhost:3000
pnpm dev:listener   # On-chain listener
pnpm dev:job        # Deposits job
pnpm dev:all        # All in parallel
```

## Layout

| Path | Description |
|------|-------------|
| [`apps/web/`](apps/web/) | Next.js frontend |
| [`apps/api/`](apps/api/) | HTTP API (Express) |
| [`apps/backend/`](apps/backend/) | Legacy backend (Lambda / MongoDB) |
| [`apps/listener/`](apps/listener/) | On-chain event listener |
| [`apps/job-deposits/`](apps/job-deposits/) | Deposits history job |
| [`apps/deployer/`](apps/deployer/) | DeFindex vault deployer |
| [`contracts/`](contracts/) | Soroban contracts (`vaquita-pool`) |
| [`packages/`](packages/) | Shared packages |

Each folder has its own `README.md` with details.

## Contracts

Soroban workspace in [`contracts/`](contracts/). Build, tests, coverage, and CI: see [`contracts/README.md`](contracts/README.md).

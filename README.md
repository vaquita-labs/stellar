# Vaquita Stellar

Vaquita monorepo on Stellar: frontend, API, services, and Soroban contracts.

[![Contracts CI](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml/badge.svg?branch=main)](https://github.com/vaquita-labs/stellar/actions/workflows/contracts-ci.yml)
[![API CI](https://github.com/vaquita-labs/stellar/actions/workflows/api-ci.yml/badge.svg)](https://github.com/vaquita-labs/stellar/actions/workflows/api-ci.yml)
[![Web CI](https://github.com/vaquita-labs/stellar/actions/workflows/web-ci.yml/badge.svg)](https://github.com/vaquita-labs/stellar/actions/workflows/web-ci.yml)
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
| [`apps/web/`](apps/web/) | Gamified DeFi frontend (Next.js + R3F) |
| [`apps/api/`](apps/api/) | HTTP API (Express) |
| [`apps/listener/`](apps/listener/) | On-chain event listener |
| [`apps/job-deposits/`](apps/job-deposits/) | Deposits history job |
| [`apps/deployer/`](apps/deployer/) | DeFindex vault deployer |
| [`contracts/`](contracts/) | Soroban contracts (`vaquita-pool`) |
| [`packages/`](packages/) | Shared packages |

Each folder has its own `README.md` with details.

## Frontend

`apps/web/` is a gamified DeFi experience built on Next.js 16 (App Router) with React 19 and Tailwind v4. It uses Three.js + React Three Fiber for the 3D layer, HeroUI for components, Zustand + TanStack Query for state/data, and Stellar Wallets Kit for on-chain interactions.

Main screens:

- **Home** — pools, deposits and on-chain positions.
- **Profile** — user profile with achievements/badges.
- **Leaderboard** — ranking of users by activity.
- **Shop** — in-app items and rewards.
- **Onboarding** — first-run wallet + profile flow.

More details in [`apps/web/README.md`](apps/web/README.md).

## API

The HTTP API is deployed at **`https://api.vaquita.fi`** and serves live data
from Supabase (staging/production). All routes live under `/api/v1`.

- **Endpoint reference:** [`apps/api/README.md`](apps/api/README.md#endpoints)
- **Liveness:** [`https://api.vaquita.fi/api/v1/health`](https://api.vaquita.fi/api/v1/health) — confirms the API process is up
- **DB health:** [`https://api.vaquita.fi/api/v1/health/db`](https://api.vaquita.fi/api/v1/health/db) — pings Supabase and reports DB connectivity
- **Config (example live data):** `curl https://api.vaquita.fi/api/v1/config`

## Contracts

Soroban workspace in [`contracts/`](contracts/). Build, tests, coverage, and CI: see [`contracts/README.md`](contracts/README.md).

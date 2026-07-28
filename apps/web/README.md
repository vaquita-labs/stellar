# @vaquita/web

Vaquita frontend. Next.js 16 + React 19, Tailwind v4, HeroUI, Three.js / R3F for the 3D layer, Stellar SDK + Stellar Wallets Kit.


## Run in development

From the monorepo root:

```bash
pnpm dev:web
```

Or inside `apps/web`:

```bash
pnpm dev      # next dev --turbopack -p 3101
pnpm build    # next build
pnpm start    # next start
pnpm lint
pnpm format   # prettier --write .
```

Server at `http://localhost:3101`.

## Environment variables

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

All variables are required and validated with zod in
`src/core-ui/config/clientEnv.ts` — the build fails if any is missing. Key ones:

```bash
NEXT_PUBLIC_SERVICES_URL=https://api.vaquita.fi
NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL=https://mainnet.sorobanrpc.com
NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY=pub_mainnet_…   # its prefix picks the active network
```

> Check `.env.example` for the full list. (`env.example`, without the dot, holds
> parameters for the Stellar contract testing scripts — not app config.)

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **UI:** HeroUI + Tailwind CSS v4 + Framer Motion
- **3D:** Three.js, `@react-three/fiber`, `@react-three/drei`
- **State / data:** Zustand + TanStack Query
- **Wallets / chain:** `@stellar/stellar-sdk`, `@creit.tech/stellar-wallets-kit`, `viem`
- **Realtime:** Ably
- **Validation:** Zod
- **Analytics:** Vercel Analytics + Speed Insights

## Internal Position API

Next.js endpoint that queries `VaquitaPool` positions via Soroban. See [`POSITION_API_README.md`](POSITION_API_README.md).

## Build & deploy

- `Dockerfile` — production image
- `next.config.ts` — framework configuration
- `Cargo.toml` / `Cargo.lock` — Rust dependencies for frontend utilities (parsers, etc.)

## Useful commands

```bash
pnpm format          # prettier across the whole tree
pnpm lint            # eslint
```

# @vaquita/listener

On-chain event listener. Listens to USDC on Base (mainnet and Sepolia testnet) and triggers the Vaquita logic in `@vaquita/shared`.

## Run in development

From the monorepo root:

```bash
pnpm dev:listener
```

Or inside `apps/listener`:

```bash
pnpm dev          # tsx watch on the main listener
pnpm start        # tsx without watch
pnpm sync         # runs src/sync.ts
pnpm check-past   # runs src/check-past-base-events.ts (backfill)
pnpm build
pnpm typecheck
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_MAINNET_RPC_URL` | `https://mainnet.base.org` | Base mainnet RPC |

Base Sepolia connects to `https://sepolia.base.org` (hardcoded in `app-listener.ts`).

> The `@vaquita/shared` functions invoked by the listener may require additional credentials (DB, etc.).

## Layout

```
src/
├── app-listener.ts            # entry point: starts Sepolia and Mainnet listeners
├── sync.ts                    # sync job
├── check-past-base-events.ts  # past-events backfill
└── listeners/
    └── base-spolia.ts         # Base listener implementation
```

## Deploy

- `Dockerfile` at `config/listener-app.Dockerfile`
- `app-listener-ecosystem.config.cjs` for PM2

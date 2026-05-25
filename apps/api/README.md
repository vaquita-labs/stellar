# @vaquita/api

Vaquita HTTP API. Express 5 + TypeScript with structured logging via `pino`.

## Run in development

From the monorepo root:

```bash
pnpm dev:api
```

Or inside `apps/api`:

```bash
pnpm dev      # tsx watch (hot reload)
pnpm start    # tsx (no watch)
pnpm build    # compile to JS
pnpm typecheck
```

Listens on `http://localhost:3000` by default. Configurable via `PORT`.

## Environment variables

Loaded with `dotenv` from `.env` (in `apps/api/`).

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Environment |

> Routes may need additional variables (Privy, Stellar RPC, etc.). Check the handlers in `src/routes/` before pointing this at production.

## Endpoints

All routes live under the `/api/v1` prefix:

| Path | Folder |
|------|--------|
| `/api/v1/config` | [`src/routes/config`](src/routes/config) |
| `/api/v1/health` | [`src/routes/health`](src/routes/health) |
| `/api/v1/profile` | [`src/routes/profile`](src/routes/profile) |
| `/api/v1/deposit` | [`src/routes/deposit`](src/routes/deposit) |
| `/api/v1/network` | [`src/routes/network`](src/routes/network) |
| `/api/v1/user` | [`src/routes/user`](src/routes/user) |

The main router is in [`src/routes/index.ts`](src/routes/index.ts).

### Health checks

Two separate endpoints. Both are public (no auth).

**`GET /api/v1/health`** — liveness. Answers "is the API process alive?".
Has no external dependencies, so a flaky Supabase will not flip this to red
(which would cause orchestrators to reboot the container for no reason).

```bash
curl https://api.vaquita.fi/api/v1/health
```

```json
{
  "status": "success",
  "message": "alive",
  "data": {
    "service": "ok",
    "env": "production",
    "uptimeSec": 1234,
    "ts": "2026-05-25T00:00:00.000Z"
  }
}
```

**`GET /api/v1/health/db`** — readiness. Pings Supabase with a trivial query
and reports DB connectivity. Returns `200` when the DB is reachable, `503`
when it is not.

```bash
curl https://api.vaquita.fi/api/v1/health/db
```

```json
{
  "status": "success",
  "message": "db reachable",
  "data": {
    "db": "ok",
    "env": "production",
    "ts": "2026-05-25T00:00:00.000Z",
    "latencyMs": 42
  }
}
```

## Layout

```
src/
├── app-api.ts        # entry point: express, middlewares, error handler
├── lib/
│   └── logger.ts     # shared pino logger
└── routes/
    ├── index.ts      # aggregator router
    ├── config/       # config endpoints
    ├── deposit/
    ├── network/
    ├── profile/
    ├── user/
    ├── wallets/
    └── withdraw/
```

## Logging

`pino-http` logs each request with an automatic level:

- `5xx` or error → `error`
- `4xx` → `warn`
- otherwise → `info`

Unhandled errors (`uncaughtException`, `unhandledRejection`) are logged as `fatal` before any crash.

## Build & deploy

- `Dockerfile` — runtime image
- `docker-compose*.yml` — composes for different environments
- `app-api-ecosystem.config.cjs` — PM2 config
- `deploy_vaquita_services.md` / `deploy_vaquita_services-pm2.md` — deployment runbooks

# @vaquita/job-deposits

Periodic job that maintains the deposits history per profile. It walks every cached profile, sums successful deposits, and writes the incremented snapshot via `@vaquita/shared`.

## Run in development

From the monorepo root:

```bash
pnpm dev:job
```

Or inside `apps/job-deposits`:

```bash
pnpm dev        # tsx watch
pnpm start      # tsx without watch
pnpm build
pnpm typecheck
```

## How it works

`src/app-job-deposits-history.ts`:

1. Loads cached profiles (`getCachedProfiles`).
2. For each profile, sums deposits in `DEPOSIT_SUCCESS` state.
3. If no deposits record exists for the profile, creates one.
4. Calls `profileIncrement` with the updated snapshot.
5. Re-runs every `HISTORICAL_DELAY` (defined in `@vaquita/shared`).

Errors are logged but don't stop the loop (`safeFun` wraps the execution).

## Environment variables

Whatever `@vaquita/shared` requires (DB / cache access). Check that package before running.

## Deploy

- `Dockerfile` at `config/job-deposits-app.Dockerfile`
- `app-job-deposits-history-ecosystem.config.cjs` for PM2

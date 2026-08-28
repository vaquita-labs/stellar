# Dokploy — `apps/metrics` (growth dashboard)

`apps/metrics` is a passcode-protected Next.js app (same stack and auth as `apps/admin`) that
reads the **existing Postgres** (`DATABASE_URL`) and renders growth metrics: users, deposits,
retention, engagement, per-chart CSV export and a weekly markdown report. It has **no
`NEXT_PUBLIC_*` variables**, so the build needs no build-time arguments beyond what CI sends.

Local run:

```bash
pnpm dev:metrics   # http://localhost:3103 — needs DATABASE_URL + METRICS_PASSCODE in the env
```

## 1. Create the application in Dokploy

Dokploy → project (same one as `vaquita-admin`) → **Create Application** → `vaquita-metrics`.

| Setting | Value |
|---|---|
| Provider | GitHub (same repository as the other apps) |
| Branch | `dev` (or `main` for production) |
| Build type | **Dockerfile** |
| Dockerfile path | `apps/metrics/Dockerfile` |
| Build context / Docker context path | `.` (repository root — the Dockerfile copies the whole pnpm workspace) |
| Container port | `3000` |
| Domain | e.g. `metrics-dev.vaquita.fi` → port `3000`, HTTPS on |

Leave **Autodeploy (webhook) off** if you want deploys driven only by the GitHub workflow below
(same pattern as admin); turn it on if you prefer Dokploy's own push-to-deploy.

## 2. Variables (see `docs/dokploy.md` for what each section means)

### Environment Settings (runtime)

```env
NODE_ENV=production
DATABASE_URL=postgresql://…            # the SAME value the API/admin of this environment use
METRICS_PASSCODE=<at least 8 characters, shared with the team>
METRICS_ENV_LABEL=dev                  # shown in the top bar: dev | staging | production
```

Use a `DATABASE_URL` that goes through the Supabase **pooler** (port 6543 / `pgbouncer=true`),
like the API does — the dashboard opens one short-lived Prisma connection per request.

### Build-time Arguments

Nothing required. `DEPLOY_ID` is passed by the workflow automatically (it is only used to tag
the build in the notification webhook).

### Build-time Secrets (optional)

Only if you want Slack/Discord build notifications, exactly like admin:

```
webhook_url   = <NOTIFICATION_WEBHOOK_URL>
webhook_token = <NOTIFICATION_WEBHOOK_TOKEN>
```

## 3. GitHub Actions (`.github/workflows/deploy-metrics.yml`)

A copy of `deploy-admin.yml`: triggers on pushes to `dev` touching `apps/metrics/**`,
`packages/**` or the workflow, and calls the Dokploy API to deploy.

GitHub → repo **Settings → Environments → New environment** `vaquita-metrics-dev`, with secrets:

| Secret | Value |
|---|---|
| `DOKPLOY_TOKEN` | Dokploy API token (same one used by the admin environment is fine) |
| `DOKPLOY_APPLICATION_ID` | the new application's id (Dokploy → application → *General*, or from the URL) |
| `NOTIFICATION_WEBHOOK_URL` / `NOTIFICATION_WEBHOOK_TOKEN` | optional, for deploy notifications |

`DOKPLOY_HOST` is hardcoded in the workflow (`https://dokploy-stellar.vaquita.fi`), as in the
other deploy workflows. Run it manually the first time from **Actions → Auto Deploy Metrics (dev)
→ Run workflow**.

## 4. Checklist after the first deploy

- `https://<domain>/login` renders; the passcode logs you in and `/` shows KPI tiles.
- The top bar shows the right `METRICS_ENV_LABEL`.
- `/report` renders and the **↓ .md** button downloads `vaquita-weekly-<date>.md`.
- If **Engagement → Fiat on-ramp purchases** says the table is not present, that environment
  has not received the `onramp_purchases` migration yet — everything else still works.

## Notes

- There is no read-only DB role: the app runs plain `SELECT`s with the API's credentials, so
  keep the passcode private and the domain behind HTTPS.
- Sessions are an HMAC of the passcode in a cookie (`vaquita_metrics_session`); changing
  `METRICS_PASSCODE` logs everyone out.

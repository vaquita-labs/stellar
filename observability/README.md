# Vaquita Observability Runbook

Operational runbook for Vaquita's Grafana Cloud observability (see
`docs/grafana-cloud-observability-prd.md` and its Deliverable 3.2 addendum).

> **Secrets never live in this file or anywhere in Git.** The six
> `GRAFANA_CLOUD_*` credentials live only in Dokploy / host secrets. This
> runbook records **non-secret** facts (URLs, usernames, scopes, owners, dates)
> so the team can operate the pipeline without hunting through the Cloud UI.

## Backend

One shared Grafana Cloud **Free** stack for dev/staging/prod, separated by
labels: `environment` (`dev`|`staging`|`prod`), `project=vaquita`, `service`,
`host`, `container`.

| Field | Value |
|-------|-------|
| Org / login owner | Vaquita team (shared project login) |
| Stack name | petiteattic1642 |
| Region | US East (prod-us-east-3) |
| Created | 2026-07-23 |

## Connection details (non-secret)

### Metrics — Prometheus remote write

| Field | Secret name (Dokploy) | Value |
|-------|-----------------------|-------|
| Remote write URL | `GRAFANA_CLOUD_PROMETHEUS_REMOTE_WRITE_URL` | `https://prometheus-prod-66-prod-us-east-3.grafana.net/api/prom/push` |
| Username / instance ID | `GRAFANA_CLOUD_PROMETHEUS_USERNAME` | `3369732` |
| API token (password) | `GRAFANA_CLOUD_PROMETHEUS_API_KEY` | **secret — Dokploy only, not recorded here** |

### Logs — Loki push

| Field | Secret name (Dokploy) | Value |
|-------|-----------------------|-------|
| Push URL | `GRAFANA_CLOUD_LOKI_PUSH_URL` | `https://logs-prod-042.grafana.net` (Alloy `loki.write` appends `/loki/api/v1/push`) |
| Username / instance ID | `GRAFANA_CLOUD_LOKI_USERNAME` | `1680541` |
| API token (password) | `GRAFANA_CLOUD_LOKI_API_KEY` | **secret — Dokploy only, not recorded here** |

## Access Policy tokens

Two narrowly-scoped Access Policy tokens (not legacy API keys, not a personal
token, kept separate for independent rotation). No service-account / HTTP-API
automation token is created yet — that is deferred to issue 041.

| Purpose | Scope | Owner | Created | Rotated |
|---------|-------|-------|---------|---------|
| Metrics publishing | `metrics:write` | Vaquita team | 2026-07-23 | — |
| Log publishing | `logs:write` | Vaquita team | 2026-07-23 | — |

## Free-tier limits (baseline for usage guardrails — issue 040)

Grafana Cloud Free, as observed at setup (fill in exact figures from the stack's
usage/billing page):

| Resource | Limit | Notes |
|----------|-------|-------|
| Active metric series | ~10k | product gauges are ~9 flat series; watch API HTTP label growth |
| Logs ingested | 50 GB / mo | after the log hygiene gate (037) |
| Retention | 14 days | accepted for the MVP public dashboard |
| Users | 3 | — |
| Synthetic Monitoring checks | see "Synthetic Monitoring" section | 2 checks × 1 probe × 60s |

## API metrics surface (implemented — issue 035, 067)

- `apps/api` exposes `GET /api/v1/metrics` (Prometheus exposition), gated by
  `OBSERVABILITY_METRICS_ENABLED=true`. **Private-only** — scraped by Alloy over
  the host/container network; never publicly exposed, never scraped by Grafana
  Cloud over the internet.
- Infra/health metrics: `vaquita_api_http_requests_total`,
  `vaquita_api_http_request_duration_seconds`,
  `vaquita_api_http_requests_in_flight`, `vaquita_api_health_db_latency_seconds`,
  `vaquita_api_health_db_failures_total`.
- DB-derived product gauges (refreshed every `OBSERVABILITY_METRICS_REFRESH_MS`,
  default 60s): `vaquita_pool_tvl_usdc`, `vaquita_pool_deposit_volume_usdc`,
  `vaquita_pool_deposits_total`, `vaquita_pool_withdrawals_total`,
  `vaquita_pool_active_positions`, `vaquita_pool_unique_wallets`,
  `vaquita_badges_minted_total`, `vaquita_badges_unique_minters`, plus
  `vaquita_pool_stats_refresh_failures_total`.

## Alloy collectors

One Alloy **per host**; `environment` is a per-target label (dev/staging/prod)
so shared host metrics aren't duplicated. Deploy from `main` (Grafana configs
always deploy from `main`).

| Host | Envs | Config | Compose | Deploy Path |
|------|------|--------|---------|-------------|
| A (`ubuntu-4gb-ash-1`) | dev/testnet + staging/mainnet | `observability/alloy/host-a.alloy` | `alloy-compose.yml` | container `vaquita-alloy-host-a` |
| B (prod) | prod/mainnet | `observability/alloy/host-b.alloy` | `alloy-compose.prod.yml` | container `vaquita-alloy-host-b` |

**Scrape targets (internal Dokploy service names, private):**

| Env | api-service (internal) | Deploy branch |
|-----|------------------------|---------------|
| dev | `vaquita-apiservice-ni4qwm:3100` | `dev` |
| staging | `vaquita-apiservice-q9savv:3100` | `main` |
| prod | `vaquita-api-service-7ksgla:3100` | `main` |

**Each api-service needs** `OBSERVABILITY_METRICS_ENABLED=true` and the 035/067
metrics code on its deploy branch. Each Alloy service needs the three
`GRAFANA_CLOUD_PROMETHEUS_*` env vars (image pinned `grafana/alloy:v1.17.0`).

**Verify (Grafana Cloud → Explore) — staging first, then prod:**

- `vaquita_pool_tvl_usdc{environment="staging"}` / `{environment="prod"}`
- `vaquita_api_http_requests_total{environment="prod"}`
- `node_cpu_seconds_total{host="host-b"}`

**Logs:** enabled in the same configs. Dokploy sets no environment/service
Docker labels (only the Swarm service name), so logs use **option 1** — an
explicit slug→environment mapping in `discovery.relabel` for the api-services
(`ni4qwm`→dev, `q9savv`→staging, `7ksgla`→prod). A `loki.process` stage promotes
pino's `level` to a label and scrubs bearer tokens (second layer after the 037
app-level gate) before `loki.write`. Bounded Loki labels only: `project`,
`environment`, `service`, `host`, `container`, `level`. Requires the three
`GRAFANA_CLOUD_LOKI_*` env vars on each Alloy service. Currently api-services
only; web/admin/jobs can be added by extending the relabel keep-list (or by
adding custom Docker labels in Dokploy — "option 2")._

## Log hygiene (issue 037)

App-level redaction gate that must be in place before staging/prod logs are
exported to Grafana Cloud Logs (issue 038). Alloy adds a second redaction layer
before `loki.write`; this app-level pass is not optional.

**Redacted in API logs** (`apps/api/src/lib/logger.ts`, `REDACT_PATHS`, censored
to `[REDACTED]`, top-level and one level deep):

- auth/session: `authorization`, `cookie`, `password`, `token`, `accessToken`,
  `refreshToken`, `idToken`, `sessionToken`, `jwt`
- API keys: `apiKey` / `api_key` / `apikey`
- secrets/signing: `secret`, `sessionSecret`, `authSessionSecret`, `signingSeed`,
  `signingKey`, `privateKey` / `private_key`, `serverPrivateKey`
- seed phrases: `seed`, `seedPhrase`, `mnemonic`
- DB/connection: `databaseUrl` / `database_url`, `connectionString`
- webhooks: `webhookToken` / `webhook_token`, `x-webhook-token`, `x-api-key` headers
- raw on-chain envelopes: `transactionRaw`, `transactionEventRaw`,
  `transaction_event_raw` — **never logged**

**Request logging** (`serializeReq`): logs the route path only — the query
string is stripped and the raw `query` object is dropped, so secrets passed as
query params never reach the logs. The same query-strip applies to the pino-http
success/error messages.

**Wallet addresses & transaction hashes**: may appear in log **bodies** only when
operationally necessary. They must **never** become Loki labels.

**Allowed Loki labels** (set by Alloy, not the app): `environment`, `project`,
`service`, `host`, `container`, `level`. Nothing else — no wallet addresses,
transaction hashes, request IDs, deposit IDs, or user identifiers as labels.

## Synthetic Monitoring (issue 068)

Grafana Cloud Synthetic Monitoring runs external HTTP probes against the public
endpoints and emits `probe_*` metrics into the stack's Prometheus. These feed
the "uptime" panel on the public dashboard (069). Uptime % is
`avg_over_time(probe_success{job="..."}[$__range]) * 100`; response time is
`probe_duration_seconds`.

| Check (job) | Target | Probe | Labels |
|-------------|--------|-------|--------|
| `vaquita-api-health` | `https://api.testnet.dev.vaquita.fi/api/v1/health` | 1 (NA) | `project=vaquita`, `service=api`, `environment=dev` |
| `vaquita-web` | _TBD — public web app URL_ | 1 (NA) | `project=vaquita`, `service=web`, `environment=dev` |

- Currently scoped to the live testnet/dev endpoints. When mainnet is live, add
  prod-targeted checks (or repoint) and the public dashboard filters
  `environment="prod"`.
- Free-tier Synthetic Monitoring budget observed at setup: _TBD — record exact
  allowance_ (baseline for the 040 usage alert).

## Dashboards

_Populated by issue 039 (private ops) and 069 (public product dashboard).
Record here: dashboard names, key panels, data sources, the public dashboard
URL, and known gaps._

## Alerts

_Populated by issue 040. Record each alert: name, query, threshold, pending
period, no-data behavior, contact point, owner, reason._

## Change log

| Date | Change | By |
|------|--------|----|
| 2026-07-23 | Initial Grafana Cloud stack + `metrics:write` / `logs:write` tokens provisioned (issue 055) | Vaquita team |

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
| Synthetic Monitoring checks | _TBD_ | needed for issue 068 uptime |

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

_Populated by issue 036 (dev) and 038 (staging/prod). Record here: Alloy image
tag (pinned), host names/labels, deploy commands, and Cloud Explore smoke-test
queries._

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

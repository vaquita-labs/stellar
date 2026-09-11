# @vaquita/metrics — growth dashboard

Passcode-protected Next.js app (port **3103** locally) that reads the existing Postgres and
shows how the team is growing: users, deposits, retention, engagement, a per-chart CSV export
and a weekly markdown report you can paste into Slack/Notion.

```bash
pnpm dev:metrics              # from the repo root
pnpm --filter @vaquita/metrics typecheck
pnpm --filter @vaquita/metrics lint
```

Environment (`.env.example`): `DATABASE_URL`, `METRICS_PASSCODE` (≥ 8 chars), `METRICS_ENV_LABEL`.
No `NEXT_PUBLIC_*` variables. Deployment: `docs/metrics-dokploy-setup.md`.

## Pages

| Route | What it shows |
|---|---|
| `/` | Overview KPIs (users, new users, depositors, volume, TVL, activation) + 4 charts |
| `/users` | Signups (organic vs referred), total users, signup→deposit funnel, top referrers |
| `/deposits` | Volume, count & depositors, TVL, inflow vs outflow, lock-period split, top depositors |
| `/volume` | Money moved, split into edge / savings / peer-to-peer crossings; by type, by user |
| `/retention` | Weekly repeat-deposit cohorts, early vs on-time withdrawals, yield paid out |
| `/engagement` | Daily check-ins, follows/map likes, badges (by type), map items, push, on-ramp & bridge |
| `/report` | Weekly report (7 days vs the 7 before + all-time), copy or download as `.md` |
| `GET /api/report?to=YYYY-MM-DD` | The same report as a `text/markdown` download |

Every page takes `?range=30d|90d|180d|365d|all&bucket=day|week|month`; every chart and table
has a **CSV** button that downloads exactly the rows it renders.

## Definitions

- Amounts are USDC as stored in `deposits.amount`; only `status = 'confirmed'` rows count.
- **Gross volume** = the sum of three boundaries, each counting a movement exactly once: **edge**
  (money entering or leaving Vaquita), **savings** (wallet ↔ vault or lock period) and
  **peer to peer** (one user to another). It is processed value, not money held — a dollar that
  arrives, is saved, is unsaved and leaves is four crossings. Flexible-vault `internal_*` flows are
  excluded as a true double count, Bolivian on-ramp value is excluded as unconvertible, and
  Argentine fiat has no table at all.
- **TVL / locked principal** = confirmed principal − withdrawn principal (yield excluded).
- **Early withdrawal** = withdrawn before `deposit time + lock_period` (`lock_period` is in ms).
- **Activated** = profile with ≥ 1 confirmed deposit; **cohort** = week of the first one.
- Daily check-ins come from `profiles_rewards.reason = 'daily-checkin'`.

## Layout

```
src/app/(dashboard)/   pages (server components, force-dynamic)
src/app/api/           auth (passcode → HMAC cookie) and the report download
src/lib/queries/       one file per page, raw SQL via prisma.$queryRaw
src/lib/report.ts      weekly markdown generator
src/components/        charts (recharts), KPI tiles, CSV button, cohort grid, nav
```

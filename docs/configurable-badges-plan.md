# Configurable Badges — Backend Catalog + Rules Engine

**Status:** in progress · **Owner:** —— · **Created:** 2026-05-29

## Goal

Make the badge (achievement) catalog **driven by the backend and editable from the
admin panel**, with no frontend redeploy needed to:

- **Add** new badges and **disable** old ones (`enabled = false`, never hard-delete —
  historical claims must survive).
- Edit metadata: title, description, icon, accent, tier, coin reward, display order,
  visible/hidden.
- Choose how each badge unlocks (`unlock_type`):
  - **`rule`** — configurable rules engine over the signals the backend already computes.
  - **`redeem_code`** — code-gated badge (e.g. `VERANO26`), already supported today.
  - **`manual`** — admin-granted.
  - **`cycle_rank`** — leaderboard badges (cycle-scoped special logic).

## Hard constraint: the signal vocabulary is fixed by code

The rules engine makes **thresholds and combinations configurable** over the signals the
backend already produces. A **brand-new signal always requires backend code** — the
engine evaluates data that exists; it does not invent it.

Signals available today (`computeEligibilitySignals`,
`packages/shared/src/services/profile/index.ts:624`):

| Signal            | Type          | Source                                    | Notes |
|-------------------|---------------|-------------------------------------------|-------|
| `createdAt`       | `Date \| null`| `profiles.created_at`                     | date ops |
| `experience`      | `number`      | active deposits (XP formula)              | |
| `streakCount`     | `number`      | savings streak                            | |
| `activeDeposits`  | `number`      | deposits in `DEPOSIT_SUCCESS`             | |
| `activeAmount`    | `number` USDC | sum of active deposits                    | |
| `friendsCount`    | `number`      | **hardcoded `0`** — no friends system yet | rules over friends won't fire until built |
| `leaderboardRank` | `number?`     | only for `cycle_scoped` badges            | needs cycle context → `cycle_rank` type |

Referral codes (true per-user referral system) do **not** exist and are **out of scope** —
that is a separate project (a `referrals` table, unique codes, anti-abuse, plus a new
`referralCount` signal). "Referral codes" in the request meant **redeem codes**, which are
already covered by `unlock_type = 'redeem_code'`.

## Current state (source map)

- **Frontend catalog (hardcoded):** `apps/web/src/core-ui/data/achievement-catalog.ts` —
  16 badges with `id/title/description/icon/accent/tier`. Header comment already
  anticipates becoming a thin client of a backend endpoint.
- **Backend catalog:** `achievements` table (Supabase). Columns today: `id, key, name,
  description, tier, coin_reward, code, hidden, refresh_policy, cycle_scoped, created_at,
  updated_at`. See migrations `20260516_profile_achievements.sql`,
  `20260517_achievement_codes.sql`, `20260520_achievements_refresh_policy.sql`.
- **Unlock conditions (hardcoded):** `isEligibleForAchievement()` switch,
  `packages/shared/src/services/profile/index.ts:677`.
- **Claim route:** `apps/api/src/routes/profile/route.ts:259` (claim),
  `:340` (redeem), `:245` (list). Cycle-scoped branch at `:281`.
- **Mint:** `tier` is used as the Soroban contract symbol — editing `tier` from admin can
  break on-chain minting. Guard it.

## Rule JSON shape

Stored in `achievements.rule` (JSONB), only when `unlock_type = 'rule'`. AND of
conditions (enough for all 16 current badges; extensible to `any`/OR later):

```json
{ "all": [
  { "signal": "experience",  "op": ">=", "value": 500 },
  { "signal": "streakCount", "op": ">=", "value": 14 }
] }
```

- Numeric ops: `>=`, `>`, `<=`, `<`, `==`.
- Date ops (for `createdAt`): `before`, `after` (value is an ISO string).
- The evaluator references a **signal registry (whitelist)**; an unknown signal is a
  validation error at save time (Zod) and evaluates to `false` defensively.

### Backfill map (16 badges → rule)

| key              | unlock_type  | rule |
|------------------|--------------|------|
| beta-tester      | rule         | `createdAt before 2026-05-17T23:59:59Z` |
| rookie           | rule         | `experience >= 50` |
| week-warrior     | rule         | `streakCount >= 7` |
| first-deposit    | rule         | `activeDeposits >= 1` |
| first-friend     | rule         | `friendsCount >= 1` |
| savings-starter  | rule         | `activeAmount >= 100` |
| trio-saver       | rule         | `activeDeposits >= 3` |
| month-master     | rule         | `streakCount >= 30` |
| explorer         | rule         | `experience >= 300` |
| streak-master    | rule         | `streakCount >= 50` |
| whale            | rule         | `experience >= 30000` |
| savings-baron    | rule         | `activeAmount >= 10000` |
| century-saver    | rule         | `streakCount >= 100` |
| third-place      | cycle_rank   | rank in [3,10] |
| second-place     | cycle_rank   | rank == 2 |
| first-place      | cycle_rank   | rank == 1 |

## Work plan

### Phase 1 — Schema + backfill
- New migration in `apps/supabase/migrations/`: add `unlock_type TEXT`, `rule JSONB`,
  `icon TEXT`, `accent TEXT`, `display_order INT`, `enabled BOOLEAN DEFAULT true`.
  Reconcile with existing `code/hidden/refresh_policy/cycle_scoped`.
- Backfill `unlock_type` + `rule` for the 16 badges (table above), plus `icon/accent`
  from the frontend catalog and `display_order` from current order.
- Update `AchievementDocument` (`packages/shared/src/types/interfaces.ts`).

### Phase 2 — Generic rule evaluator
- `evaluateRule(rule, signals): boolean` + signal registry (whitelist) in
  `packages/shared`.
- Replace the `isEligibleForAchievement` switch with data-driven evaluation: read
  `unlock_type` + `rule` from the catalog. Keep `cycle_rank` special logic for leaderboard.
- Zod schema to validate rules at save time.
- Unit tests covering all 16 current badges (parity with the old switch).

### Phase 3 — Catalog endpoint + web as client
- `GET /api/v1/achievements/catalog` (public, cached): `enabled`, respects `hidden`,
  ordered by `display_order`, includes `icon/accent/tier`.
- Convert `achievement-catalog.ts` into a client of that endpoint with a **static
  fallback**. Adapt `buildAchievements()` and verify OG/share image flow.

### Phase 4 — Admin CRUD (protected)
- In `apps/api/src/routes/admin/` (uses `requireAdminSecret`): `GET/POST/PATCH
  /admin/achievements`. Disable via `enabled = false`, never DELETE. Zod-validate rules.
- Supabase service in `packages/shared`.

### Phase 5 — Admin UI (rule builder)
- `apps/admin/src/app/admin/badges/page.tsx` (HeroUI + TanStack Query, `useAdminDeposits`
  pattern). Visual rule builder (signal dropdown / operator / value, add-condition = AND),
  `unlock_type` selector, badge preview, enabled toggle, icon handling
  (Supabase Storage upload or pick from existing static icons — TBD).

### Phase 6 — Guards, tests, rollout
- Lock or validate `tier` edits (Soroban symbol).
- Tests: evaluator + admin CRUD + web rendering from backend.
- Zero-downtime rollout: backend + migration + backfill → web reads endpoint with
  fallback → retire the switch and the hardcoded catalog.

## Risks

- **Fixed signals** — new signals require code. `friendsCount` is `0` until a friends
  system exists; referrals are a separate project.
- **`leaderboardRank`** needs cycle context → stays `cycle_rank`, not a pure generic rule.
- **`tier` ↔ Soroban contract symbol** — editing from admin can break minting.
- **Dual source during transition** — keep the static fallback until the endpoint is proven.

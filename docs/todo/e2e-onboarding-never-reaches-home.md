# A fresh wallet never reaches the username prompt or the home in E2E

Every Web E2E run since `d936977` is red, and the four suites that fail all fail
the same way: a new wallet signs in, and then neither the "Choose your username"
screen nor the home's Deposit button ever appears. The wait is 60 s, with two
retries on top, and all three attempts end in `element(s) not found`.

The suites still pass nothing downstream of that point, so what the failures say
about badges, the legal gate or the tour is unknown — they die in the shared
sign-in fixture before reaching their own assertions.

## What fails

| Spec | Test |
| --- | --- |
| `apps/web/e2e/onboarding.spec.ts:14` | a new wallet signs in, picks a username and lands on its home |
| `apps/web/e2e/legal.spec.ts:20` | holds a fresh wallet until both statements are accepted |
| `apps/web/e2e/badges.spec.ts:17` | a fresh wallet sees its awards locked |
| `apps/web/e2e/home-tour.spec.ts:57` | walks a first-time wallet through the home and then gets out of the way |

All four go through `apps/web/e2e/fixtures.ts`, and the assertion that times out
is the same one in both helpers:

```
apps/web/e2e/fixtures.ts:232  completeUsernamePromptIfShown
  await expect(heading.or(homeDeposit).first()).toBeVisible({ timeout: 60_000 });

apps/web/e2e/fixtures.ts:150  acceptLegalGateIfShown
  await expect(heading.or(username).or(homeDeposit).first()).toBeVisible({ timeout: 60_000 });
```

Both wait on an `or` of the screens that can legitimately follow sign-in. None of
them renders, so the app is stuck somewhere before all of them — this is not a
case of landing on the wrong screen.

## The boundary

| | Run | Commit |
| --- | --- | --- |
| Last green | 2026-09-11 14:46 UTC (`34612173327`) | `e7b1061` |
| First red | 2026-09-11 18:33 UTC (`34633899511`) | `d936977` feat(referrals): make the vaquitatag the invite code |

Twelve consecutive red runs after it, on `dev` and on `main`.

## What it is not

The selector. `UsernamePrompt.tsx:151` renders
`t('onboarding.username.title', 'Choose your username')`, so the heading the
fixture looks for is still the heading the component would produce. The rename to
Vaquitatag did not move this string.

## Two leads

**The API the suite talks to is not the API the branch builds.** `e2e.yml:40`
points `E2E_SERVICES_URL` at `https://api.testnet.development.vaquita.fi` unless
a secret overrides it, so CI builds the web app from the branch under test and
then runs it against a deployed API. That API's last Dokploy deployment is
2026-09-08, while `d936977` ships `apps/supabase/migrations/20260911_vaquitatag.sql`
and adds `setNickname` / `isCampaignCodeTaken` to
`apps/api/src/routes/profile/route.ts`. A current web build against an API three
days behind, on a database without the vaquitatag migration, is enough on its own
to strand the flow. The four `Auto Deploy` workflows are disabled, so nothing
refreshes that API when `dev` moves.

**The private layout.** `d936977` also touches
`apps/web/src/app/(private)/layout.tsx` and `HomePage.tsx`, both of which sit
between sign-in and the two elements the fixture waits for.

The first lead is cheap to settle: redeploy the dev API at the branch under test
and re-run, or point `E2E_SERVICES_URL` at a local API. If the suites go green,
this is an environment problem and not a product regression.

## Where to look

- Workflow `.github/workflows/e2e.yml`, job `Web E2E (chromium)`.
- Each run uploads `e2e-results` — Playwright traces and screenshots, kept 7 days.
- Most recent red run at the time of writing: `34686551014` (`main`).

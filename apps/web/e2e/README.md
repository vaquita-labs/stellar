# End-to-end suite (`apps/web/e2e`)

Playwright specs that drive the real web app, against the real testnet API and
the real Stellar testnet, through the five critical user flows the SCF
deliverable names:

| Spec                  | Flow                                                              | On-chain? |
| --------------------- | ----------------------------------------------------------------- | --------- |
| `onboarding.spec.ts`  | first sign-in → username prompt → home; session restore; auth gate | no        |
| `deposit.spec.ts`     | home → Deposit → Wallet → amount → confirm → "Deposit sent!"       | yes       |
| `deposit.spec.ts`     | home → Deposit → Bank → country picker (the on-ramp stops there)   | no        |
| `withdraw.spec.ts`    | home → Withdraw → Wallet → amount → confirm → "Withdrawal sent!"   | yes       |
| `leaderboard.spec.ts` | weekly league board, own "You" row, open a saver's world           | no        |
| `badges.spec.ts`      | follow → "Crew Mate" unlocks → Claim award → `mint_badge` → reward | yes       |
| `home-tour.spec.ts`   | first-time coach marks on the home: walk, skip, and stay gone      | no        |

The suite runs on one worker, serially, in file order: `deposit` leaves the
savings position `withdraw` drains, and every spec moves the same funded wallet.

`primePage` answers the profile read with `homeTourCompleted: true`, so the
home tour never starts. Its coach marks cover the button they explain with a
pane that swallows clicks, which would time out every spec that taps Deposit,
Withdraw or the side rail. `home-tour.spec.ts` passes `{ homeTour: true }` to
get the tour back, on a fresh wallet — the flag is per-user in the profile row,
so a wallet only ever meets the tour once.

Every spec runs on an **external** wallet — `local-key-adapter.ts` declares
`custody = 'external'` — so anything that exists only under social login (the
withdraw "Username" method, the idle-funds prompt, the passive vault) is not
reachable here. That is why a spec sometimes asserts something is *absent*:
see `withdraw.spec.ts`.

The local-currency on-ramp is covered up to the country picker and no further.
Picking a country asks the provider for a real quote and opens a QR somebody
has to actually pay, so the rest of that flow lives in the manual matrix
(`docs/qa/wallet-regression-matrix.md`).

The local-currency **off-ramp** — Withdraw → Bank → Bolivia, Brazil or Colombia —
is not covered at all, and cannot be. It quotes against the live provider on
every keystroke and pays out to a real bank account somebody has to own and then
check; there is no sandbox that settles, and a mocked quote would only assert our
own fixture. Nothing about that flow is a gap in this suite: it is a manual pass
by design, and it belongs to whoever has an account in the corridor. Do not add
a spec for it — add a case to the manual matrix instead.

## Running locally

```bash
cd apps/web
pnpm exec playwright install chromium   # once
pnpm test:e2e                           # headless chromium
pnpm test:e2e --headed                  # visible browser (what a screen recording captures)
pnpm test:e2e:ui                        # Playwright UI mode: pick specs, time-travel the DOM
pnpm test:e2e:report                    # open the last HTML report
node scripts/e2e-pass-rate.mjs          # pass rate from e2e-results/results.json
```

The three `E2E_*` values below are read from `apps/web/.env.e2e`, which
`playwright.config.ts` loads before starting the app, so a run does not depend
on what the current shell exports. Create that file once — it is git-ignored,
and an exported shell variable still takes precedence:

```dotenv
E2E_STELLAR_SECRET=S...
E2E_SERVICES_URL=https://api.testnet.development.vaquita.fi
E2E_POLLAR_PUBLISHABLE_KEY=pub_testnet_...
```

`playwright.config.ts` starts the app itself on port 3101 (`next dev` locally,
`next start` in CI) with `E2E_TEST_SIGNER=1`; stop any dev server already on
that port first. Only chromium runs by default, so the on-chain specs move the
wallet's funds once per run; `E2E_ALL_BROWSERS=1` adds the firefox and webkit
projects for a deliberate cross-browser pass. CI runs chromium.

Reports land in `playwright-report/` (HTML), `e2e-results/junit.xml`,
`e2e-results/results.json` and `test-results/` (traces, videos, screenshots of
failures). All four are git-ignored.

## Environment

| Variable                     | Required | Purpose                                                                                                                                        |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_STELLAR_SECRET`         | yes      | Secret key (`S…`) of a **testnet** account the specs sign with. Needs XLM for fees (friendbot) and pool USDC for deposit/withdraw (see below). |
| `E2E_SERVICES_URL`           | yes      | API base URL; exported to the app as `NEXT_PUBLIC_SERVICES_URL`. Left unset, the app falls back to its own env files — whichever environment the developer last worked on — and every spec dies on a redirect back to `/login`. CI uses `https://api.testnet.development.vaquita.fi`. |
| `E2E_POLLAR_PUBLISHABLE_KEY` | yes      | `pub_testnet_…` key; exported as `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY`. Its prefix selects the network for the whole app, so a mainnet key points the suite at mainnet and an unset one leaves it on the app's own value — the same `/login` bounce. |
| `E2E_MIN_PASS_RATE`          | no       | Threshold (percent) `scripts/e2e-pass-rate.mjs` enforces. Default `95`.                                                                        |
| `CI`                         | no       | Set by GitHub Actions: enables 2 retries, `forbidOnly`, and `next start` instead of `next dev`.                                                 |

Every other `NEXT_PUBLIC_*` value the app needs (`clientEnv.ts`) comes from the
usual `.env*` files locally and from the workflow's `env:` block in CI — see
`env.example` in this folder's parent and `.github/workflows/e2e.yml`.

### Funding the test wallet

- XLM: `curl "https://friendbot.stellar.org?addr=G..."`.
- USDC: the testnet pool accepts USDC from Blend's testnet issuer
  (`GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56`, the `issuer`
  returned by `GET /api/v1/config`). `e2e/testnet-usdc.ts` tops the wallet up
  automatically from Blend's testnet faucet
  (`GET https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets?userId=G...`
  → issuer-signed transaction that adds the trustlines and pays 1000 USDC; the
  wallet co-signs and submits it). When the faucet is unreachable the deposit
  spec skips with the wallet address and its balance in the message, and the
  withdraw spec skips when the savings position is under 1 USDC.

Onboarding and badges never touch that wallet: each of their tests mints a
fresh friendbot account so the first-visit state (no nickname, nothing
claimed) is real on every run.

## How the app is signed in (the signer shim)

All authentication and signing in the app goes through Pollar
(`@pollar/react` → `@pollar/core`). Pollar's login is a hosted modal (external
wallets or social login), which cannot be driven from CI — but its client
accepts custom `walletAdapters`, and `login({ provider: adapter.type })` runs
the SEP-10 wallet flow through the adapter's `connect()` and
`signTransaction()` with no UI.

`e2e/shim/pollar-react.tsx` re-exports the real `@pollar/react` untouched
except for `PollarProvider`, which

1. appends `LocalKeyAdapter` (`e2e/shim/local-key-adapter.ts`) to the app's
   adapter list — a `WalletAdapter` whose `connect()` returns the keypair's
   public key and whose `signTransaction()` signs with it;
2. builds **one** `PollarClient` per API key and hands the provider that
   instance. Passing a config instead would have the provider construct and
   destroy a client per mount, so React's StrictMode double mount in dev leaves
   two clients on one persisted session, and the single-use refresh-token
   rotation logs both out mid-test; and
3. mounts a component that, once `client.ready()` resolves with no session,
   calls `login({ provider: 'e2e-local-key' })`.

Everything downstream is the genuine SDK: Pollar issues its own SEP-10
challenge and session, `/tx/build` builds the Soroban transactions the app
asks for, the adapter signs them, `/tx/submit` broadcasts, `getTxStatus`
polls, and `walletSession.ts` obtains the Vaquita API session by signing the
API's challenge through `client.signTx`. No app source under `src/` changed
for this.

The keypair reaches the shim through `window.__E2E_STELLAR_SECRET__`, set by
`page.addInitScript` in `e2e/fixtures.ts` before any app code runs (the
`e2e:stellar-secret` localStorage key works too for a manual session). The
secret is never a build-time env, so it is never in a bundle.

### Why it never ships

`next.config.ts` only adds the `turbopack.resolveAlias` entry for
`@pollar/react` when `E2E_TEST_SIGNER=1` is set at dev/build time. Without the
flag the config is unchanged, `src/` imports the real package, nothing under
`e2e/` is reachable from the module graph, and the output is identical to a
build made before the folder existed. The flag is set only by
`playwright.config.ts` (`webServer.env`) and by `.github/workflows/e2e.yml`;
it must never appear in the deploy workflows or the Dockerfile.

## Adding a spec

1. Create `e2e/<flow>.spec.ts` importing `test`/`expect` from `./fixtures`.
2. Use the `homePage` fixture for a page already signed in as
   `E2E_STELLAR_SECRET` and sitting on `/home` past the username prompt, or
   `createFreshSigner()` + `primePage()` + `openSignedIn()` for a throwaway
   wallet.
3. Wrap tests in `test.describe.configure({ mode: 'serial' })` when they share
   on-chain state, and `test.skip(condition, reason)` on missing preconditions
   instead of failing — the pass-rate script excludes skips from the
   denominator but lists them in the summary.
4. Prefer role/name locators on the English copy (`core-ui/i18n/locales/en.json`);
   the fixture pins the locale to English before the profile loads, and a
   fresh profile has no language preference that could override it.

# Testing

Single entry point for how Vaquita is tested: which layer covers what, how to run each locally, what CI runs and where its reports land.

Related: [`qa/e2e-coverage-map.md`](./qa/e2e-coverage-map.md) (deliverable → artifact map) · [`qa/wallet-regression-matrix.md`](./qa/wallet-regression-matrix.md) (manual wallet protocol and results) · [`qa/recording-runbook.md`](./qa/recording-runbook.md) (commands for the demo recording).

---

## 1. Test pyramid

```
        ┌──────────────────────────────┐
        │  Manual wallet regression    │  real extensions / web wallets, 6 browsers
        ├──────────────────────────────┤
        │  Playwright e2e              │  full UI flows, wallet stubbed at the Pollar adapter
        ├──────────────────────────────┤
        │  Integration (testnet)       │  TS ↔ deployed contracts over Soroban RPC + API
        ├──────────────────────────────┤
        │  Vitest unit (web, api, shared)
        ├──────────────────────────────┤
        │  Rust contract tests         │  169 tests, ≥ 80 % line coverage enforced
        └──────────────────────────────┘
```

| Layer | What it proves | Location | Network |
|---|---|---|---|
| Rust contract tests | `vaquita-pool` and `vaquita-badges` logic: deposit/withdraw accounting, early-withdraw fee, solvency invariant (randomised), soulbound mint with backend signature, pause and timelocked upgrade, regression per security finding | `contracts/vaquita-pool/src/test/`, `contracts/vaquita-badges/src/test/` | in-process Soroban env, mock DeFindex vault |
| Vitest unit | Pure TS: Soroban tx builders, deposit-id computation, vault/Blend query parsing, tx-error humanisation, badge error mapping, feature flags, badge/leaderboard services | `apps/web/src/**/*.test.ts`, `apps/api/src/**/*.test.ts`, `packages/shared/src/**/*.test.ts` | none (stubbed env, see `apps/web/vitest.config.ts`) |
| Integration | The frontend's contract clients against the **deployed testnet contracts**: `compute_deposit_id`, `deposit`, `withdraw`, `get_position`, `mint_badge` with a claim signed by the API; SEP-10-style session against the API | `apps/web/src/networks/stellar/__integration__/` | testnet |
| Playwright e2e | User flows through the real UI: onboarding, deposit, withdraw (matured + early), leaderboard, badge claim/mint | `apps/web/e2e/*.spec.ts` | testnet (app pointed at a test API), wallet signing stubbed |
| Manual wallet regression | Real wallet UIs (Freighter, Albedo, xBull, Lobstr, Rabet, Hana), browsers, reject/wrong-network paths, session restore | `docs/qa/wallet-regression-matrix.md` | testnet, mainnet for Lobstr |

Each layer only tests what the layer below cannot. Contract arithmetic is not re-tested in e2e; wallet popups are not tested in Playwright.

---

## 2. Running locally

### Contracts

```bash
cd contracts
rustup target add wasm32v1-none        # once
make test                              # builds both WASMs, then cargo test --workspace
make coverage                          # cargo llvm-cov → lcov.info + coverage-html/, fails under 80 % lines
open coverage-html/html/index.html
```

`make test` builds the WASMs first because the upgrade and event tests `include_bytes!` the compiled binaries. Requirements in `contracts/README.md`.

### Unit (Vitest)

```bash
pnpm install
pnpm --filter @vaquita/web test        # apps/web
pnpm --filter @vaquita/api test        # apps/api
pnpm --filter @vaquita/shared test     # packages/shared
```

Web tests run in a `node` environment with a dummy `NEXT_PUBLIC_*` set from `apps/web/vitest.config.ts`; the passive-vault and install-prompt flags are deliberately left unset so tests observe the default (off) state.

### Integration (testnet)

```bash
pnpm --filter @vaquita/web test:integration
```

Needs a funded testnet account and the same `NEXT_PUBLIC_*` variables as the app (`apps/web/.env.example`), pointed at a testnet API. Contract addresses are read from `GET /api/v1/config` — never hardcoded, because testnet resets move the Blend and DeFindex addresses (`contracts/README.md`). Secrets come from the environment, never from committed files.

### End-to-end (Playwright)

```bash
pnpm --filter @vaquita/web exec playwright install --with-deps   # once
pnpm --filter @vaquita/web test:e2e
pnpm --filter @vaquita/web exec playwright show-report           # open the last HTML report
```

Runs against `next dev` on port 3101 (or `E2E_BASE_URL` when set) with a stubbed wallet adapter at the Pollar boundary, so no extension is needed. Specs live in `apps/web/e2e/`: `onboarding`, `deposit`, `withdraw`, `leaderboard`, `badges`.

### Manual wallet regression

Follow `docs/qa/wallet-regression-matrix.md`: fill the run header, execute the cases per wallet × browser, record results and evidence under `docs/qa/evidence/<run-id>/`.

### Static checks

```bash
pnpm typecheck                         # every package and app
pnpm --filter @vaquita/web lint
cd contracts && make fmt
```

---

## 3. CI

| Workflow | Trigger | Runs | Reports / artifacts |
|---|---|---|---|
| `.github/workflows/contracts-ci.yml` | push to `main`/`dev` and PR touching `contracts/**` | `stellar contract build` (pool + badges) → `cargo test --workspace` → `cargo llvm-cov` | Artifacts `contracts-lcov`, `contracts-coverage-html`; LCOV uploaded to Codecov (flag `contracts`, 80 % project/patch threshold in `codecov.yml`); badge in `README.md` |
| `.github/workflows/web-ci.yml` | PR touching `apps/web/**`, `packages/**`, lockfile | `typecheck` for `@vaquita/shared` and `@vaquita/web`, `vitest run` for web | Job log; Vitest summary in the step output |
| `.github/workflows/api-ci.yml` | PR touching `apps/api/**`, `packages/**`, lockfile | `typecheck` + `build` for `@vaquita/api`, `vitest run` for api and shared | Job log |
| `.github/workflows/integration-tests.yml` | PR touching `apps/web/src/networks/**`, `contracts/**`; manual `workflow_dispatch` | `test:integration` against testnet using the `INTEGRATION_STELLAR_SECRET` repository secret | Artifact `integration-junit`; Step Summary with passed/total |
| `.github/workflows/e2e.yml` | PR touching `apps/web/**`; nightly schedule; manual `workflow_dispatch` | `next build` with `E2E_TEST_SIGNER=1` → `test:e2e --project=chromium` | Artifacts `playwright-report` (HTML + traces on failure) and `e2e-results` (JUnit + JSON); Step Summary with passed/total |

The workflow file is the source of truth for triggers and steps. Only chromium runs by default; `E2E_ALL_BROWSERS=1 pnpm --filter @vaquita/web test:e2e` adds the Firefox and WebKit projects for a local cross-browser pass; the browser coverage the deliverable reports comes from the manual matrix in `docs/qa/wallet-regression-matrix.md`.

Mainnet operations (`mainnet-deployment.yml`, `vaquita-pool-add-rewards.yml`, `reconcile-vaquita-pool.yml`) are not test workflows; their smoke phase is read-only and documented in `docs/mainnet-readiness-runbook.md`.

### Where to find a run's report

1. GitHub → Actions → the workflow → the run for the commit.
2. **Summary** tab: Step Summary with passed/total per suite.
3. **Artifacts** section at the bottom: download `playwright-report`, `e2e-results`, `integration-junit`, `web-vitest-junit`, `api-vitest-junit` or `contracts-coverage-html`.
4. Coverage trend: https://app.codecov.io/gh/vaquita-labs/stellar (contracts flag).

### Pass-rate accounting

The deliverable threshold is **≥ 95 % across critical user flows**. It is computed per source and reported in `docs/qa/e2e-coverage-map.md` §3:

- Automated: `passed ÷ total` from the `e2e.yml` and `integration-tests.yml` Step Summaries on the submitted commit. Flaky retries count once, by final status.
- Manual: `PASS ÷ (PASS + FAIL)` from the wallet matrix tally, N/A excluded.
- Contract and unit suites must be 100 % green on the same commit; they do not enter the rate.

A critical-flow failure blocks submission regardless of the aggregate rate (wallet matrix §8).

---

## 4. Conventions

- Unit test files sit next to the code: `foo.ts` → `foo.test.ts`. Integration specs under `__integration__/`, e2e specs under `apps/web/e2e/`.
- Tests never read `.env*` files directly; they receive configuration from the environment or from the Vitest/Playwright config.
- Anything that touches a network is either an integration or an e2e test — unit tests stay offline.
- Contract test modules mirror risk: `success.rs` (happy paths), `security_fixes.rs` (one regression per finding), `conservation.rs` (solvency property), `upgrade.rs`, `vault_repoint.rs`, `coverage_gaps.rs`.
- Evidence for the SCF submission is a commit permalink plus CI run URLs, never a screenshot of a local terminal.

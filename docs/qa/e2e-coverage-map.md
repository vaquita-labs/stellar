# E2E Coverage Map

Maps each requirement of SCF deliverable 3.4 "End to End Testing" to the artifact that proves it.

**Completion criteria (verbatim):** *Automated end-to-end test suite covering onboarding, deposits, withdrawals, and leaderboard/NFT badge interactions with integration tests validating smart contract interactions with the frontend. Manual regression testing across supported wallets (Freighter, Albedo, and ≥3 additional wallets). CI pipeline report showing successful test runs with ≥95% pass rate across all critical user flows.*

Allowed status values: `planned` · `implemented` (artifact exists and passes locally) · `passing` (a CI run proves it; evidence link filled). All twelve requirements are `passing`.

---

## 1. Requirement → artifact

| # | Requirement | Layer | Artifact | Command | Workflow | Status | Evidence link |
|---|---|---|---|---|---|---|---|
| R1 | Onboarding flow | Playwright e2e | `apps/web/e2e/onboarding.spec.ts` | `pnpm --filter @vaquita/web test:e2e` | `.github/workflows/e2e.yml` | `passing` | [33070784847](https://github.com/vaquita-labs/stellar/actions/runs/33070784847) |
| R2 | Deposits | Playwright e2e | `apps/web/e2e/deposit.spec.ts` | `pnpm --filter @vaquita/web test:e2e` | `.github/workflows/e2e.yml` | `passing` | [33070784847](https://github.com/vaquita-labs/stellar/actions/runs/33070784847) |
| R3 | Withdrawals (matured + early) | Playwright e2e | `apps/web/e2e/withdraw.spec.ts` | `pnpm --filter @vaquita/web test:e2e` | `.github/workflows/e2e.yml` | `passing` | [33070784847](https://github.com/vaquita-labs/stellar/actions/runs/33070784847) |
| R4 | Leaderboard interactions | Playwright e2e | `apps/web/e2e/leaderboard.spec.ts` | `pnpm --filter @vaquita/web test:e2e` | `.github/workflows/e2e.yml` | `passing` | [33070784847](https://github.com/vaquita-labs/stellar/actions/runs/33070784847) |
| R5 | NFT badge interactions (claim + mint) | Playwright e2e | `apps/web/e2e/badges.spec.ts` | `pnpm --filter @vaquita/web test:e2e` | `.github/workflows/e2e.yml` | `passing` | [33070784847](https://github.com/vaquita-labs/stellar/actions/runs/33070784847) |
| R6 | Contract ↔ frontend integration | Integration (testnet) | `apps/web/src/networks/stellar/__integration__/` | `pnpm --filter @vaquita/web test:integration` | `.github/workflows/integration-tests.yml` | `passing` — 10 / 10 | [33073350630](https://github.com/vaquita-labs/stellar/actions/runs/33073350630) |
| R7 | Contract behaviour (deposit, withdraw, mint, governance) | Rust unit/property tests | `contracts/vaquita-pool/src/test/`, `contracts/vaquita-badges/src/test/` — 169 tests | `cd contracts && make test` | `.github/workflows/contracts-ci.yml` | `passing` | [32745186268](https://github.com/vaquita-labs/stellar/actions/runs/32745186268) |
| R8 | Contract coverage ≥ 80 % lines | Rust coverage | `contracts/lcov.info`, `contracts/coverage-html/` | `cd contracts && make coverage` | `.github/workflows/contracts-ci.yml` → Codecov (`codecov.yml`, flag `contracts`) | `passing` | [32745186268](https://github.com/vaquita-labs/stellar/actions/runs/32745186268) |
| R9 | Frontend unit tests (tx error mapping, feature flags, Soroban tx builders, vault/Blend queries) | Vitest | `apps/web/src/**/*.test.ts` | `pnpm --filter @vaquita/web test` | `.github/workflows/web-ci.yml` | `passing` | [33074309158](https://github.com/vaquita-labs/stellar/actions/runs/33074309158) |
| R10 | API unit tests | Vitest | `apps/api/src/**/*.test.ts`, `packages/shared/src/**/*.test.ts` | `pnpm --filter @vaquita/api test`, `pnpm --filter @vaquita/shared test` | `.github/workflows/api-ci.yml` | `passing` | [33074309163](https://github.com/vaquita-labs/stellar/actions/runs/33074309163) |
| R11 | Manual regression across wallets (Freighter, Albedo, ≥3 more) | Manual | [`wallet-regression-matrix.md`](./wallet-regression-matrix.md) §7 + [`evidence/2026-08-25-38cdf27/results.md`](./evidence/2026-08-25-38cdf27/results.md) | — | — | `passing` — 19 / 19 sign-off cells PASS across Freighter, xBull, Rabet and the Pollar social login on Chrome; 27 transactions verified on-chain; `W-06` (matured withdrawal) additionally exercised. Albedo BLOCKED by an `albedo.link` outage and Hana N/A (Stellar `INELIGIBLE` in that build) — neither counts against the rate | [`results.md`](./evidence/2026-08-25-38cdf27/results.md) |
| R12 | CI report with ≥ 95 % pass rate on critical flows | CI | Workflow run summaries + uploaded Playwright/Vitest reports (see §3) | — | `e2e.yml`, `integration-tests.yml`, `contracts-ci.yml` | `passing` — every workflow green, each reported suite at 100 % (see §3) | [33070784847](https://github.com/vaquita-labs/stellar/actions/runs/33070784847) · [33073350630](https://github.com/vaquita-labs/stellar/actions/runs/33073350630) · [32745186268](https://github.com/vaquita-labs/stellar/actions/runs/32745186268) |

---

## 2. Flow → layer cross-reference

Which layer exercises which part of each critical flow. `●` covered · `○` partial · `—` not at this layer.

| Flow | Rust contract tests (R7) | Vitest unit (R9/R10) | Integration testnet (R6) | Playwright e2e (R1–R5) | Manual wallets (R11) |
|---|---|---|---|---|---|
| Wallet connect / session restore | — | — | — | ● (mocked wallet) | ● (real wallets) |
| SEP-10-style API session (`walletSession.ts`) | — | ○ | ● | ● | ● |
| Onboarding (nickname, intro, tutorial, welcome reward) | — | — | — | ● | ● |
| Deposit `deposit(caller, nonce, amount, period)` | ● | ● (`sorobanTx.test.ts`, `txCredit.test.ts`) | ● | ● | ● |
| Withdraw at maturity (principal + yield + reward share) | ● | — | ● | ● | ● |
| Early withdraw (principal only, fee to protocol, yield to reward pool) | ● (`security_fixes.rs`, `conservation.rs`) | — | ● | ● | ● |
| Solvency invariant | ● (randomised property test) | — | ○ (`check_solvency` read) | — | — |
| Leaderboard ranking + badge modal | — | — | — | ● | ● |
| Badge claim signing (`GET /api/v1/claim/:network`) | — | ● (shared badge services) | ● | ● | ● |
| Badge mint `mint_badge` (signature verify, soulbound, edition cap) | ● | ● (`badgeErrors.ts` mapping) | ● | ● | ● |
| Transaction error mapping (rejected, trustline, balance, network, pending) | — | ● (`txError.test.ts`, `pollarError.test.ts`) | — | ○ | ● |
| Passive vault deposit / withdraw / migration (flag) | — | ● (`vaultQueries.test.ts`, `blendDirect.test.ts`) | ○ | ○ | ● (W-13) |
| Pause / upgrade governance | ● (`upgrade.rs`) | — | — | — | — |

---

## 3. CI report sources

One row per workflow. The "critical flows pass rate" is computed from the e2e and integration runs only (contract and unit suites are expected at 100 %).

| Workflow | Report artifact | Run | Passed / total | Pass rate |
|---|---|---|---|---|
| `.github/workflows/e2e.yml` | Playwright HTML report + JUnit | [33070784847](https://github.com/vaquita-labs/stellar/actions/runs/33070784847) · `main` @ `c40a911` | 14 / 14 | **100 %** |
| `.github/workflows/integration-tests.yml` | Vitest JUnit / JSON | [33073350630](https://github.com/vaquita-labs/stellar/actions/runs/33073350630) · `main` @ `a42e913` | 10 / 10 | **100 %** |
| `.github/workflows/contracts-ci.yml` | `contracts-lcov`, `contracts-coverage-html`; Codecov | [32745186268](https://github.com/vaquita-labs/stellar/actions/runs/32745186268) · `main` @ `dcf1660` | 169 / 169 | **100 %** |
| `.github/workflows/web-ci.yml` | `web-vitest-junit`; job summary | [33074309158](https://github.com/vaquita-labs/stellar/actions/runs/33074309158) | all green | **100 %** |
| `.github/workflows/api-ci.yml` | `api-vitest-junit`; job summary | [33074309163](https://github.com/vaquita-labs/stellar/actions/runs/33074309163) | all green | **100 %** |

Contract coverage on that run: **Functions 97/97 (100.00 %) · Lines 1206/1210 (99.67 %) · Regions 1877/1956 (95.96 %)**, uploaded to Codecov under the `contracts` flag against an 80 % threshold.

**Critical-flow pass rate for the submission** — each source reported separately, all three ≥ 95 %:

| Source | Passed / total | Rate |
|---|---|---|
| Automated e2e (`e2e.yml`) | 14 / 14 | **100 %** |
| Integration (`integration-tests.yml`) | 10 / 10 | **100 %** |
| Manual wallet matrix | 19 / 19 | **100 %** |

---

## 4. Known gaps

Recorded so the reviewer sees them before finding them. Update as they close.

| Gap | Impact | Covered by | Status |
|---|---|---|---|
| Automated e2e cannot drive real extension popups; wallet signing is stubbed at the Pollar adapter boundary | Real wallet UI, reject button, network selector | Manual matrix R11 | by design |
| Testnet Blend / DeFindex addresses change on every testnet reset (`contracts/README.md`) | Integration suite needs re-pointing after a reset | `/api/v1/config` as single source of truth in the suite | |
| Positions with lock period > ~90 d archive before maturity (`docs/architecture.md` §9.2) | Matured-withdraw on long periods needs a TTL restore first | Not covered; latent unless a > 90 d period is configured | |
| A matured withdrawal is recorded by the API as `withdraw_success_early`, the same state as a forfeited one | Portfolio history and any state-driven reporting will say the saver lost interest when they were paid in full (payout verified correct: 1.80 principal → 1.9906779 received) | Manual run 2026-08-25-38cdf27, finding F-18 | open |
| Nonce ABI migration (`deposit_id: String` → `nonce: u64`) needs an end-to-end testnet smoke (`docs/architecture.md` §9.5) | Deposit/withdraw join key | R6 + W-05/W-06/W-07 | |
| Lobstr is mainnet-only | No testnet coverage for that wallet | Manual run on the mainnet build | |
| The welcome reward is gated on `tutorialCompleted`, a flag only the globally disabled tutorial writes, so no new user is ever offered it | R11 `W-04` cannot pass until the gate is fixed; the reward itself works and credits 1 USDC on-chain | Manual run 2026-08-25-38cdf27, finding F-07 (`ClaimGate.tsx` / `TutorialGate.tsx`) | open |
| The wallet session token `vaquita-wallet-session` survives *Sign out* | A later user of the same browser inherits a live API session | Manual run 2026-08-25-38cdf27, finding F-05 | open |
| Auth failures and unattended signature prompts both surface as "network" errors, and the progress state renders before the user signs | Users check their connection instead of their wallet or their session | Manual run 2026-08-25-38cdf27, findings F-01 / F-09 / F-14 | open |
| The locked deposit runs through the flexible vault: two transactions and two signatures, and both withdrawals return to savings rather than the wallet | The protocol described a one-signature flow the product does not have | Manual run 2026-08-25-38cdf27, findings F-10 / F-11 | closed — §5 of the wallet matrix now describes the real flow |

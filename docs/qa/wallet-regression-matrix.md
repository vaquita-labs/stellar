# Wallet Regression Matrix

Manual regression protocol for the Vaquita web app across supported Stellar wallets, and the result matrix that records each run.

**Deliverable:** SCF 3.4 "End to End Testing" — *manual regression testing across supported wallets (Freighter, Albedo, and ≥3 additional wallets)*. The automated suites that cover the same flows are indexed in [`e2e-coverage-map.md`](./e2e-coverage-map.md); the overall test strategy is in [`../testing.md`](../testing.md).

---

## 1. Scope

This protocol exercises every user-facing flow that ends in a wallet signature, on every wallet the app exposes in its login modal, on every browser where that wallet runs. It covers what automation cannot: the real extension / web-wallet UI, its network selector, its reject button, and its behaviour after a page reload.

In scope:

- Connect, session restore, logout, reconnect.
- The API wallet session (SEP-10-style challenge signature).
- Onboarding (nickname → intro → tutorial → welcome reward).
- Deposit into `vaquita-pool` for each configured lock period.
- Withdraw at maturity and early (forfeited yield).
- Leaderboard rendering and the read-only badge modal.
- Achievement claim and soulbound badge mint on `vaquita-badges`.
- Negative paths: rejected signature, wrong network, missing trustline.
- The passive/flexible balance flow when `NEXT_PUBLIC_PASSIVE_VAULT_ENABLED=true`.

Out of scope: fiat on/off-ramp (Anclap, SEP-24), CCTP bridge, admin console, contract governance. Those have their own runbooks.

### How wallets reach the app

Wallet connectivity is delegated to Pollar. `apps/web/src/components/providers/Providers.tsx` registers every module of `@creit.tech/stellar-wallets-kit` (via `@pollar/stellar-wallets-kit-adapter`) as a `WalletAdapter`, and Pollar's hosted login modal renders them behind a single "Wallet" gateway button next to its own social-login and passkey options. The `picker.wallets` filter is not set, so the modal shows the adapter's full default list (12 modules). Ledger, Trezor and WalletConnect are opt-in in the adapter and are **not** enabled.

The active network is fixed at build time: `getStellarNetwork()` in `apps/web/src/networks/stellar/kit.ts` reads the prefix of `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` (`pub_mainnet_…` → `Networks.PUBLIC`, anything else → `Networks.TESTNET`) and the kit is initialised with that value. There is no in-app network switch; a wallet on the other network is a negative test case (`W-11`).

Pollar exposes the session as `wallet.custody`:

| `custody` | Meaning | Where the code branches |
|---|---|---|
| `external` | Kit wallet (Freighter, Albedo, xBull, …). Signs in the wallet's own UI. | `WithdrawModal.tsx` (payout goes back to the signer, no destination picker), `DepositMethodModal.tsx` ("Wallet" → amount form), `useAutoInvest.ts` (disabled), `usePassiveMigration.ts` (partial migration offered) |
| `internal` | Social login (Google/email). Pollar-managed account, signs server-side without a prompt. | `WithdrawModal.tsx` (2-step, destination = saved external wallet), `DepositMethodModal.tsx` ("Wallet" → receive-to-address modal), `useAutoInvest.ts` (idle-funds nudge), `usePassiveMigration.ts` (moves the whole position) |
| `smart` | Passkey smart account (C-address). WebAuthn prompt. | Same branches as `internal`; rejection surfaces as `NotAllowedError` / `AbortError` (`helpers/txError.ts`) |

The matrix is run per external wallet. One social-login column is kept as the control for the custodial branch.

---

## 2. Supported wallets

Minimum set for sign-off: **Freighter, Albedo, xBull, Rabet** plus a fifth signing path — Hana was the intended fifth but marks Stellar `INELIGIBLE` (run 2026-08-25-38cdf27, F-17), so that run used the **Pollar social login**, which is the embedded wallet rather than an external one — the deliverable's "Freighter, Albedo, and ≥3 additional wallets". Lobstr is mainnet-only and therefore optional (see §3). Kit version at the time of writing: `@creit.tech/stellar-wallets-kit` 2.3.0, `@pollar/stellar-wallets-kit-adapter` 0.11.2 (see `apps/web/package.json` / lockfile for the resolved versions of the build under test).

| Wallet | Kit id | Type | Works in | Network switching | Install |
|---|---|---|---|---|---|
| Freighter | `freighter` | Browser extension (+ mobile app with in-app dApp browser) | Chrome, Firefox, Brave, Edge | Settings → Network: Testnet / Public / Futurenet / custom. The kit passes the passphrase per request; Freighter refuses to sign for a network it is not on. | https://freighter.app |
| Albedo | `albedo` | Web wallet (popup at `albedo.link`, no extension) | Any desktop or mobile browser that allows popups | Chosen per request by the app (`testnet` / `public`); no user-side switch. | https://albedo.link (account created in the popup) |
| xBull | `xbull` | Browser extension, PWA, mobile app | Chrome, Firefox, Edge (extension); any browser via PWA | Follows the network the app requests; the extension also has its own network selector. | https://xbull.app |
| Lobstr *(optional)* | `lobstr` | Mobile app paired through the LOBSTR signer browser extension (deep link / QR) | Chrome, Edge (extension); mobile app iOS / Android | **Mainnet only.** Testnet cells are N/A; this wallet is run against the mainnet build. | https://lobstr.co · extension from the Chrome Web Store |
| Rabet | `rabet` | Browser extension (+ mobile app) | Chrome, Firefox, Edge, Brave | Extension settings → Network toggle. | https://rabet.io |
| Hana *(not usable)* | `hana` | Browser extension (+ mobile app) | Chrome, Edge | **Stellar is listed `INELIGIBLE`** and cannot be activated, so the wallet holds no Stellar account (run 2026-08-25-38cdf27, F-17). | https://hanawallet.io |

Also present in the modal but not part of the sign-off set: Bitget, CactusLink, Fordefi, HOT Wallet, Klever, OneKey. Record them under "Additional wallets" in §7 if they are exercised.

> Confirm the browser support of each wallet against its vendor page on the day of the run and correct the table in the run header if it has drifted; extension availability changes without notice.

---

## 3. Browser matrix

The deliverable names **wallets, not browsers**. Sign-off therefore runs on
**Chrome (desktop)** only — the one browser where all five required wallets ship
an extension or a supported web flow. Every other browser is *nice to have*: run
it when there is time, record it in the extra-rows table of §7, never treat it as
a blocker.

| Wallet | Chrome (desktop) — sign-off | Nice to have |
|---|---|---|
| Freighter | ✓ | Firefox, Edge, Brave; Freighter app in-app browser (iOS / Android) |
| Albedo | ✓ | Firefox, Safari, Edge, iOS Safari, Android Chrome |
| xBull | ✓ | Firefox, Edge; PWA on Safari and mobile |
| Rabet | ✓ | Firefox, Edge, Brave |
| Hana | N/A — no Stellar account | — |
| Social login (control) | ✓ | any browser |
| Lobstr *(optional)* | N/A — mainnet-only | Chrome / Edge against the mainnet build |

### Case set for sign-off

The completion criteria name four flows: onboarding, deposits, withdrawals, and
leaderboard/NFT badge interactions. The cases that cover them, run on all five
wallets, are the sign-off set:

**W-01, W-05a, W-07, W-08, W-09.**

`W-06` (withdraw at maturity) is deliberately **not** in this set: the shortest
lock period the testnet pool offers is 7 days, so no position opened during a run
can mature inside it. The matured payout (principal + yield + reward share) is
proven by the Rust contract tests (R7) and the principal path by the testnet
integration suite (R6); the manual pass covers withdrawal through `W-07`.

`W-04` (onboarding) is also outside the set: the completion criteria name
onboarding for the **automated** suite, where `apps/web/e2e/onboarding.spec.ts`
covers it (R1); the manual sentence names wallets, not flows. The manual set
therefore keeps the cases that end in a wallet signature. `W-04` is still run and
recorded in the extended table.

The remaining cases of §5 (`W-02`, `W-03`, `W-04`, `W-05b/c`, `W-06`, `W-10`–`W-15`) stay
in the protocol as the fuller regression. They are recorded in the extended table
of §7 when exercised and are excluded from the pass rate when not.

## 4. Preconditions (all cases)

- Build under test deployed to the environment named in the run header; commit SHA recorded.
- `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` prefix matches the intended network; `GET <SERVICES_URL>/api/v1/config` returns the pool and badges contract addresses for that network.
- Funded test account per wallet: XLM for reserves plus the USDC issuer the pool accepts (`tokens[].address` from `/api/v1/config`), with the trustline already added except where the case says otherwise.
- Wallet extension/app installed, unlocked, set to the network under test.
- Browser DevTools open on the Console tab; console errors are part of the evidence.
- Fresh profile for `W-04` (a wallet address never seen by the API), reusable profile for everything else.
- A brand-new address is stopped by a legal-consent gate (*"Before you continue"* / *"Antes de continuar"*: Privacy Policy, Terms of Service, Risk Disclosure) before it reaches `/home`. The tester accepts it — it is a legal acceptance on their account, not something automation may click. It applies to external wallets and to the social login alike.
- For `W-06` a position whose `finalization_time` has passed. Use a short lock period on testnet (`add_lock_period` from `contracts/Makefile`) or a position created in a previous run.

Local storage keys that carry state between reloads and must be cleared for a "clean" case: `pollar:session`, `pollar:walletType`, `wallet:adapter`, `swk:address`, `vaquita-wallet-session`, `vaquita-rq-cache`.

Explorer link pattern (from `apps/web/src/networks/stellar/helpers.ts`):

```
https://stellar.expert/explorer/testnet/tx/<hash>
https://stellar.expert/explorer/public/tx/<hash>
```

---

## 5. Test cases

Severity: **critical** cases block sign-off on any FAIL (§8). *Ext* = external wallets only, *Cust* = custodial only, *All* = both.

### W-01 · Connect wallet through the Pollar modal — critical · Ext

1. Open `/login`. Press **Sign in**.
2. In the Pollar modal choose **Wallet**, then the wallet under test.
3. Approve the connection in the wallet.

Expected: modal closes; app routes to `/home` (or to `UsernameGate` for a new profile); header shows the truncated address; `localStorage['wallet:adapter'] === 'pollar'`; no console errors.

### W-02 · Session restore after reload — critical · All

Precondition: W-01 passed in this tab.

1. Press F5 on `/home`.
2. Navigate directly to `/leaderboard` by URL.

Expected: loader shows while `PollarBridge` restores the session, then the page renders **without** a redirect to `/login` and without a re-connect prompt from the wallet. Balances render from the persisted query cache without a spinner.

### W-03 · API wallet session (SEP-10-style challenge) — critical · All

Precondition: `localStorage['vaquita-wallet-session']` removed.

1. Trigger an authenticated mutation (e.g. change the nickname in `/profile/edit`, or the daily check-in).
2. Immediately trigger a second mutation while the first prompt is still open.

Expected (Ext): **one** signature prompt for the challenge transaction (`POST /api/v1/auth/challenge` → sign → `POST /api/v1/auth/verify`), not one per request; both mutations succeed; `vaquita-wallet-session` now holds `{walletAddress, token, expiresAt}`.
Expected (Cust): no prompt; the same key is populated.

### W-04 · Onboarding flow — critical · All

Precondition: fresh wallet address.

1. Connect (W-01).
2. `UsernameGate` asks for a nickname — enter one already taken, then a free one.
3. Walk the `OnboardingIntro` slides; land on `/onboarding` (product demo) and `/tutorial`.
4. On first arrival at `/home`, `ClaimGate` shows the welcome reward. If a trustline is missing, activate it from the modal first. Claim.

Expected: taken nickname is refused with an inline message; free nickname persists; `tutorialCompleted` then `onboardingCompleted` flip in `GET /api/v1/profile` and neither gate reappears after F5; welcome reward credited (or "nothing to claim" closes the modal silently).

### W-05 · Deposit, per lock period — critical · All

Run once per period offered by the deposit modal (`tokens[].lockPeriods` from `/api/v1/config`; sub-cases `W-05a`, `W-05b`, `W-05c` in the order the modal lists them, e.g. 7 d / 3 m / 6 m).

Money reaches a lock period in two hops, and the wallet balance is not investable
directly. Home → **Deposit** is the flexible Blend path (no lock, case `W-13`);
the locked `deposit(caller, nonce, amount, period)` lives in **Portfolio →
Invest** and spends the flexible savings.

1. Home → **Deposit** → **Wallet**. Enter an amount above the minimum and confirm.
   Sign once (Ext; Cust signs server-side). This funds the flexible savings.
2. Open **Portfolio** → the lock period → **Invest**. Enter the amount and confirm.
3. Sign **twice**: the vault withdraw that frees the money, then the pool deposit
   that locks it. The modal shows both steps ("Getting your money ready" →
   "Locking in 7 days").

Expected: `deposit(caller, nonce, amount, period)` succeeds; the position appears
in `/portafolio?period=<period>` with its countdown; the API reports the position
as `deposit_success`. Record both tx hashes. Note that the progress state renders
before the wallet prompt is answered, so a pending signature looks like a stall
(F-14), and an unattended prompt surfaces as a network error (F-09).

### W-06 · Withdraw matured position — critical · All · outside the sign-off set (§3)

Precondition: position past `finalization_time` — not reachable inside a run
while the shortest testnet lock period is 7 days. Run it only after an admin has
added a short lock period (`make add-lock-period` in `contracts/`), or against a
position left by an earlier run.

1. Open the position from `/portafolio?period=<period>` → its detail sheet. A
   matured position reads *"Ready to withdraw — 100 %"* with no forfeit warning.
2. Withdraw. Confirm: the sheet promises the principal **plus the share of the
   pool rewards**.
3. Sign **twice**: pool withdraw, then the deposit back into the flexible savings.

Expected: payout = principal + reward share, and it lands in the **flexible
savings**, not in the signing wallet — the wallet USDC balance does not move.
Verify the payout by the savings delta. Record both tx hashes.

Known defect: the API records the position as `withdraw_success_early`, the same
state as a forfeited withdrawal, because the withdrawal's `reward` column is never
written (F-18). Read the payout, not the state, until that fix ships.

### W-07 · Withdraw early (forfeited yield) — critical · All

Precondition: position still locked.

1. Open the position detail. It reads *"Locked"* with the countdown.
2. Withdraw. The confirmation warns in red that the rewards will be forfeited.
3. Sign **twice**: pool withdraw, then the deposit back into the flexible savings.

Expected: payout = principal only, landing in the **flexible savings** rather than
the wallet; the API reports the position as `withdraw_success_early`; no error
toast. Record both tx hashes.

### W-08 · Leaderboard renders and badge modal opens — All

1. Open `/leaderboard`.
2. Tap another user's header badge.

Expected: board renders the weekly ranking with the own row pinned; `LeaderboardBadgeModal` opens read-only (no claim/mint buttons); the explorer link appears only when the viewer has crypto mode on **and** the owner minted the badge on-chain.

### W-09 · Achievement claim and NFT badge mint — critical · All

Precondition: at least one achievement in `claimable` state on `/profile/achievements`.

1. Open the achievement → `AchievementModal` → **Claim**.
2. Sign the mint in the wallet (Cust: no prompt — Pollar signs and fee-bumps).

Expected: `GET /api/v1/claim/:network` returns a signed claim; `mint_badge` succeeds; modal shows the tx hash linking to the explorer; tile state becomes `minted`; coin/XP reward reflected in the profile header; a second claim of the same badge is refused with the `alreadyClaimed` message (`networks/stellar/badgeErrors.ts`). Record the tx hash.

### W-10 · Reject / cancel the signature — critical · Ext (Cust: passkey only)

1. Start W-05 and press **Reject** / close the wallet popup at the signature step.
2. Repeat on W-09.
3. Repeat on W-03 (challenge signature).

Expected: toast/inline notice reads *"You cancelled the signature. No changes were made."* (`humanizeTxError`); the modal returns to an actionable state (retry possible, no infinite spinner); no position or badge created; for W-03 the mutation fails with the API's 401 message suffixed by the wallet reason, and the next mutation prompts again.

### W-11 · Wrong network in the wallet — critical · Ext (wallets with a user-side selector)

1. Switch the extension to the other network (testnet ↔ public).
2. Attempt W-01, then W-05.

Expected: the wallet refuses or warns, and the app surfaces a readable error (network / generic branch of `humanizeTxError`) instead of a raw XDR or `HostError`; no half-created state; switching the wallet back and retrying succeeds. For Albedo and other wallets where the app dictates the network this case is N/A.

### W-12 · Logout and reconnect with a different wallet — All

1. Profile → settings → log out.
2. Reload. Connect with a different wallet (or social login).

Expected: after logout `pollar:session`, `wallet:adapter` and `vaquita-wallet-session` are gone and `/home` redirects to `/login`; the second connection shows the second account's balances and positions, never the first's (query cache keyed by address).

### W-13 · Passive / flexible balance — All · only when `NEXT_PUBLIC_PASSIVE_VAULT_ENABLED=true`

1. Deposit through the passive path (no lock).
2. Withdraw part of it through `WithdrawModal` (Ext: back to the signer; Cust: pick a saved external wallet, or add one with `AddWalletForm`).
3. If the account still holds a legacy direct-Blend position, the migration prompt from `usePassiveMigration` appears: Ext chooses a partial amount, Cust moves all.

Expected: vault position and available balance move together (`useLivePassiveUsdc`); the two-transaction migration leaves nothing stranded if interrupted after the withdraw; a Blend borrow blocks migration with a clear message. Mark N/A when the flag is off in the build under test.

### W-14 · Missing USDC trustline — Ext

1. Use an account without the pool's USDC trustline. Attempt W-05.

Expected: error reads *"Your wallet needs to enable USDC first…"* (contract `#13` / trustline branch); after adding the trustline in the wallet the deposit succeeds.

### W-15 · Transaction history and explorer links — All

1. Open `/transactions` and one `/transactions/<id>`.

Expected: every deposit/withdraw from this run is listed with the right state and its hash opens the explorer URL for the active network.

---

## 6. Run header

Copy one block per run. Fill everything before the first case.

```
Run id:            <YYYY-MM-DD>-<short-sha>
Build commit:      <full sha>          Branch: <dev|main>
Environment URL:   <https://…>
API URL:           <https://…/api/v1>
Network:           <testnet|mainnet>   Passphrase: <…>
Pool contract:     <C…>                Badges contract: <C…>
Feature flags:     PASSIVE_VAULT=<true|false>  INSTALL_PROMPT=<true|false>
Wallets kit:       <resolved version>  Pollar adapter: <resolved version>
Testers:           <name (initials)>, …
Evidence folder:   <path or link>
```

---

## 7. Results matrix

One row per wallet on Chrome, one column per case of the sign-off set (§3). Cell
format:

```
PASS | FAIL | N/A
tester · browser+version · wallet version
tx: <explorer link>   (W-05/06/07/09 only)
note / issue: <link>
```

Leave cells empty until run; an empty cell counts as not run, never as PASS.

| Wallet · Browser | W-01 | W-05a | W-07 | W-08 | W-09 |
|---|---|---|---|---|---|
| Freighter · Chrome | PASS | PASS | PASS | PASS | PASS |
| xBull · Chrome | PASS | PASS | PASS | PASS | PASS |
| Rabet · Chrome | PASS | PASS | PASS | PASS | PASS |
| Social login (Pollar) · Chrome | N/A | PASS | PASS | PASS | PASS |
| Albedo · Chrome | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Hana · Chrome | N/A | N/A | N/A | N/A | N/A |

Run 2026-08-25-38cdf27 · **19 / 19 PASS** · 27 transactions verified on-chain.
The filled run, with transaction hashes, screenshots and findings, is in
[`evidence/2026-08-25-38cdf27/results.md`](./evidence/2026-08-25-38cdf27/results.md).
**BLOCKED** = the wallet's own service was unreachable (`albedo.link` outage);
**N/A** = the case or the wallet does not apply (Hana cannot hold a Stellar
account; the social login has no external wallet to connect).

### Extended cases (recorded when exercised)

Out of the sign-off set; excluded from the pass rate while empty.

| Wallet · Browser | W-02 | W-03 | W-05b | W-05c | W-06 | W-10 | W-11 | W-12 | W-13 | W-14 | W-15 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Freighter · Chrome | | | | | | | | | | | |
| Albedo · Chrome | | | | | | | | | N/A | | |

### Extra wallets and browsers (nice to have)

Anything beyond the sign-off grid: Lobstr on mainnet, a second browser, a mobile
run, or one of the other modal wallets (Bitget, CactusLink, Fordefi, HOT Wallet,
Klever, OneKey).

| Wallet · Browser | Cases run | Result | Notes |
|---|---|---|---|
| | | | |

### Per-run tally

| Metric | Value |
|---|---|
| Applicable cells (PASS + FAIL) | |
| PASS | |
| FAIL | |
| Pass rate (PASS ÷ applicable) | |
| Critical FAILs | |
| Open issues | |
| Sign-off (name, date) | |

---

## 8. Pass criteria

**Pass rate** = `PASS ÷ (PASS + FAIL)` over every filled cell in §7, N/A and empty cells excluded, all wallets pooled. The deliverable requires **≥ 95 %**.

Sign-off additionally requires, regardless of the rate:

1. Every case of the sign-off set (`W-01`, `W-04`, `W-05a`, `W-07`, `W-08`, `W-09`) is PASS in Chrome on all five required wallets: Freighter, Albedo, xBull, Rabet, Hana. A critical case of §5 that was exercised outside that set and failed is treated as a FAIL under rule 2.
2. No critical case is FAIL on any wallet. A critical FAIL is fixed and the affected column re-run on the new commit (new run header, old results kept).
3. Every FAIL cell links an issue. A FAIL that is reproduced with the wallet alone (outside Vaquita) is recorded as FAIL with the note `wallet defect` and the vendor issue link; it counts against the rate but does not block sign-off.
4. No uncaught console error during a PASS case. An error that does not change the outcome is a PASS with a note and an issue.
5. The run header commit is the commit submitted as evidence.

A run that misses 1–4 is recorded as **FAILED RUN**; a subsequent run supersedes it but does not delete it.

---

## 9. Evidence collection

Collected per cell, at the moment of the expected result.

**Naming:** `<run-id>_<wallet>_<browser>_<case>_<nn>.png` — e.g. `2026-09-01-ab12cd3_freighter_chrome_W-05a_02.png`. Screen recordings use the same stem with `.mp4`; one recording may cover a whole column if each case start is visible.

**What each case needs:**

| Case | Minimum evidence |
|---|---|
| W-01, W-02, W-12 | Wallet approval dialog; app header with the address; DevTools → Application → Local Storage after the step |
| W-03 | Network tab showing `auth/challenge` + `auth/verify` once; the wallet prompt |
| W-04 | Nickname gate, last intro slide, welcome-reward modal, profile response with both flags `true` |
| W-05, W-06, W-07, W-09 | Wallet signature prompt; app success screen with hash; the explorer page of the hash |
| W-08, W-15 | Rendered page |
| W-10, W-11, W-14 | Wallet rejection/warning; the app's error message |
| W-13 | Balance before/after; migration prompt if shown |

**Where:** `docs/qa/evidence/<run-id>/` in the repository for screenshots under ~200 KB each; larger recordings in the team drive folder linked from the run header. The folder also holds `results.md` — a copy of the filled §6 + §7 for that run, so the matrix in this file can be reset for the next run while the history stays.

**Console and network:** the completion criteria ask for wallets, not logs, so no console export is required. DevTools stays open on the Console tab and the console is read during each case — §8 rule 4 still applies. Export a log only when it backs a finding, and name it `<run-id>_<wallet>_<browser>_console.log`.

**SCF submission:** reference (a) the permalink of `docs/qa/evidence/<run-id>/results.md` at the submitted commit, (b) the CI run URLs listed in [`e2e-coverage-map.md`](./e2e-coverage-map.md), and (c) one explorer link per critical on-chain case (W-05, W-06, W-07, W-09) per wallet. Do not attach raw wallet secret material, seed phrases or session tokens in any evidence file.

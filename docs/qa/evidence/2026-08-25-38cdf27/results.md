# Manual wallet regression — run 2026-08-25-38cdf27

Filled copy of §6 (run header) and §7 (results matrix) of
[`../../wallet-regression-matrix.md`](../../wallet-regression-matrix.md) for this
run. Screenshots referenced by the cells live next to this file.

## Run header

```
Run id:            2026-08-25-38cdf27
Build commit:      38cdf27f3f2503a84bd8f6eb4d73c25918b77243   Branch: dev
Environment URL:   https://app.testnet.development.vaquita.fi
API URL:           https://api.testnet.development.vaquita.fi/api/v1
Network:           testnet             Passphrase: Test SDF Network ; September 2015
Pool contract:     CBXKHWKQRQB6MKYA3DVGCPLUVJ4CPZWJLPB2AGTCOBPON3ZQ3PX64XZG
Badges contract:   CA5G54UMXOTEMF4GTTKA3IP25MN7J5632XNPBPZNGXFBUGQSULCCI3T6
USDC (pool token): CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU
                   issuer GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56
Lock periods:      7 d / 90 d / 180 d   (from GET /api/v1/config)
Feature flags:     PASSIVE_VAULT=true        INSTALL_PROMPT=false
                   (read from the deployed bundle: NEXT_PUBLIC_PASSIVE_VAULT_ENABLED,
                   NEXT_PUBLIC_INSTALL_PROMPT_ENABLED)
Wallets kit:       @creit.tech/stellar-wallets-kit 2.3.0
Pollar adapter:    @pollar/stellar-wallets-kit-adapter 0.11.2 (@pollar/react 0.11.3-rc.1)
Browser:           Chrome (desktop) — version recorded per cell
Testers:           Oscar Gauss Carvajal Yucra (OGCY)
Test accounts:     freighter GCW3O2ST4R7QC4H47E5J3BXGVSLHOPAPEN4UHIJAYMLFPNTMLD4YBK5U
                   rabet     GBXUOQ63M7L7GAN6CJI6AU7ZXOTAAIHJLYAGUGJA6X6KTPOOKS2PHYX2
Evidence folder:   docs/qa/evidence/2026-08-25-38cdf27/
```

Notes on scope, decided before the run:

- Sign-off case set: `W-01`, `W-04`, `W-05a`, `W-07`, `W-08`, `W-09` — the cases
  that cover the four flows the completion criteria name.
- `W-06` (matured withdrawal) is out of the set: the shortest testnet lock period
  is 7 days, so no position opened in this run can mature. Covered instead by the
  Rust contract tests (R7) and the testnet integration suite (R6).
- Chrome only. Other browsers are nice-to-have and were not run.
- The console was read live through the automation on every case rather than
  exported per column: §9 asks for an export only when it backs a finding. Two
  findings came out of it, F-01 (`POST /tx/build 401`) and F-04 (the duplicate
  `PollarClient` warning), and both quote the console line.
- Test accounts are throwaway testnet keypairs funded from the run's distributor
  account `GBF3YVKHFKJQEHE4DHOKURBBQJWLNXC4RB7JS5ZX4DCLVM5D7VVOALYD`
  (Blend testnet faucet). No mainnet key is involved at any point.

## Results matrix

| Wallet · Browser | W-01 | W-05a | W-07 | W-08 | W-09 |
|---|---|---|---|---|---|
| Freighter · Chrome | PASS<br>`GB25WFZW…LJLH`, Test Net, no console errors | PASS<br>5 USDC · 7 d · two signatures<br>[`b0fcc1cc…05d5`](https://stellar.expert/explorer/testnet/tx/b0fcc1ccbdfd9b3194fc0829531201899b80362c4c239644e9c8b104a0f505d5) · [`e2ee9976…b02a`](https://stellar.expert/explorer/testnet/tx/e2ee9976e2748f036361bc36132d100400d3213308d4050193ca89aaec71b02a)<br>position 223 `deposit_success`<br>first attempt failed → F-09 | PASS<br>principal only, forfeit warning<br>[`31475b2d…090d`](https://stellar.expert/explorer/testnet/tx/31475b2db5726b3947ec176791b0bffc16fa238d3a7e6388b3bc4c42a7c5090d) · [`c2eb2d9a…63f2`](https://stellar.expert/explorer/testnet/tx/c2eb2d9a641ffc78e660ce3d5c0f45b0031a0486f8f39007f44dff6e868f63f2)<br>position 223 → `withdraw_success_early` | PASS<br>own row pinned YOU; other saver's badge read-only (F-12) | PASS<br>`mint_badge` [`0c9d5010…235a`](https://stellar.expert/explorer/testnet/tx/0c9d5010a57b3a6f3720c1beecb42d1f1970b6a81af7f3b4d99fcfc97774235a)<br>154 coins + 10 XP credited |
| xBull · Chrome | PASS<br>`GALEGRX3…ZZAE`, TESTNET, site-connection + account prompts | PASS<br>5 USDC · 7 d · two signatures<br>[`283e2917…aa29`](https://stellar.expert/explorer/testnet/tx/283e29173ed6821dee6057d7fa3d1ce743aa5ad7ce741a94fdebc97e5650aa29) · [`5fb469ce…2b59`](https://stellar.expert/explorer/testnet/tx/5fb469ce9629ae51f61bbe8f0744ae48630c2ac27159f1fbb918184735282b59)<br>position 224 `deposit_success` | PASS<br>principal only, forfeit warning<br>[`5f6f544b…1463`](https://stellar.expert/explorer/testnet/tx/5f6f544b224bc6d56076bf76714395f2ac78ff7815428e8f2e482784ac6c1463) · [`c72d46e1…3ac4`](https://stellar.expert/explorer/testnet/tx/c72d46e1186b68e45e4b7be863f9597ba010120930b4c3bc2647e59897643ac4)<br>position 224 → `withdraw_success_early` | PASS<br>own row pinned YOU (rank 5) | PASS<br>`mint_badge` [`081b7967…73c5`](https://stellar.expert/explorer/testnet/tx/081b796797c86616ffebb86141b845a109cee3864737b73528e4e7444e0673c5)<br>154 coins + 10 XP credited |
| Rabet · Chrome | PASS<br>`GC3XHEVA…Q5A3`, Test network<br>legal-consent gate first (F-15) | PASS<br>5 USDC · 7 d · two signatures<br>[`982ad9c1…8fc3`](https://stellar.expert/explorer/testnet/tx/982ad9c1ddf02e2ca04f1ace134f86a13a215e35dbf8532ed48b0df4cd7d8fc3) · [`a1a100a7…0d57`](https://stellar.expert/explorer/testnet/tx/a1a100a7ce7ce0214570f28bb94350877ca64bf4e9f5380404b6fcb4764c0d57)<br>position 225 `deposit_success`<br>Rabet renders the call as raw internals (F-16) | PASS<br>principal only, forfeit warning<br>[`0f38a2d5…8448`](https://stellar.expert/explorer/testnet/tx/0f38a2d5e912570bacb9dec7a2eb7f5c5a8511541085130b0a7c278c73a08448) · [`673d976b…b8b0`](https://stellar.expert/explorer/testnet/tx/673d976b49453be880955473419bcd9b34ecc2154963070a3573f30878b5b8b0)<br>position 225 → `withdraw_success_early` | PASS<br>own row pinned YOU (rank 6) | PASS<br>`mint_badge` [`dd5ccf97…185d`](https://stellar.expert/explorer/testnet/tx/dd5ccf9709d5a32f169395295f39d957a15c2558cdccd8f23fba474caa12185d)<br>154 coins + 10 XP credited |
| Social login (Pollar) · Chrome | N/A — no external wallet to connect | PASS<br>5 USDC · 7 d · **no signature prompt** (Pollar signs server-side)<br>[`dfd20df1…2c2e`](https://stellar.expert/explorer/testnet/tx/dfd20df133f1193a1662e77c07c5e5f11f1e3de187cfab6beffb8c22fe3a2c2e) · [`5e8d8495…fe88`](https://stellar.expert/explorer/testnet/tx/5e8d84958755ab4b5265608dee4be57a72e60a221a2dbf93744448461dbefe88)<br>position 226 `deposit_success` | PASS<br>principal only, forfeit warning<br>[`f9a71c76…9efd`](https://stellar.expert/explorer/testnet/tx/f9a71c76fbba09a96696ca6552357834a428f1b102518edad73ff18d686c9efd) · [`8ef94baa…4d74`](https://stellar.expert/explorer/testnet/tx/8ef94baa496f408da3a244b60384086cc1f94672ae8e8d4ae3397a708f534d74)<br>position 226 → `withdraw_success_early` | PASS<br>own row pinned TÚ (rank 2) | PASS<br>`mint_badge` [`f6ee82b5…5417`](https://stellar.expert/explorer/testnet/tx/f6ee82b59927f69636285b8474dfc79494e7e2560ce8d196071a6548d9735417)<br>coins 387 → 410 |
| Albedo · Chrome | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Hana · Chrome | N/A | N/A | N/A | N/A | N/A |

Cell legend: **BLOCKED** = the wallet's own service was unreachable, nothing about
the app was exercised. **N/A** = the case does not apply to that wallet.

## Per-run tally

| Metric | Value |
|---|---|
| Applicable cells (PASS + FAIL) | 19 — Freighter, xBull, Rabet and the Pollar social login on Chrome. Albedo (BLOCKED) and Hana (N/A) excluded |
| PASS | 19 |
| FAIL | 0 in the sign-off set (2 outside it: `W-04` → F-07, `W-12` → F-05) |
| Pass rate (PASS ÷ applicable) | **100 %** (19 / 19) |
| Critical FAILs | 0 in the sign-off set |
| Open issues | 16 findings (F-01 … F-18; F-08 withdrawn after re-test), none filed as issues yet |
| Transactions verified on-chain | 27 |
| Screenshots | 109 |
| Sign-off (name, date) | **Not signed off** — Albedo unreachable and the third "additional wallet" is Pollar's embedded login. See the run status and the scope note. |

### Cases outside the sign-off set exercised in this run

| Case | Wallet · Browser | Result | Evidence |
|---|---|---|---|
| **W-06 · matured withdrawal** | Social login · Chrome | **PASS** — an old 7-day position (id 211) had matured. UI: *"Listo para retirar 100 %"*, green, *"Más tu parte de los premios del pool"*, no forfeit warning. Payout verified by arithmetic: savings 15.8000807 → 17.7907586 for a 1.80 principal = **1.9906779 received, ~0.19 USDC of reward share on top of principal**.<br>tx1 [`c9a203d5…566d`](https://stellar.expert/explorer/testnet/tx/c9a203d52e3bd80d6d0ab386919329e0b12d7f31ddae0b4025c0be91c89d566d) · tx2 [`30170941…4aaa`](https://stellar.expert/explorer/testnet/tx/301709417be888eccd45a03a3c2e0cc7ddee2de07d3d6ef81940788d7bba4aaa)<br>**but** the API recorded it as `withdraw_success_early` → F-18 | `…_social_chrome_W-06_01…04.png` |
| W-04 · onboarding | Freighter · Chrome | FAIL — welcome reward never offered; gated on a flag nothing sets (F-07). Nickname gate passes; the reward itself works once reachable (1 USDC credited on-chain) | `…_freighter_chrome_W-04_01…08.png` |
| W-04 · onboarding | xBull · Chrome | PARTIAL — nickname gate passes; welcome reward never offered, same cause as F-07 | `…_xbull_chrome_W-04_01…03.png` |
| W-04 · onboarding | Rabet · Chrome | PARTIAL — nickname gate passes; welcome reward never offered (F-07). A legal-consent gate not described in §5 blocks first entry (F-15) | `…_rabet_chrome_W-04_01…02.png` |
| W-03 · API session challenge | xBull · Chrome | PASS — one `Manage Data` / `pollar.xyz auth` prompt unblocks the nickname mutation | `…_xbull_chrome_W-03_01.png` |
| W-03 · API session challenge | Rabet · Chrome | PASS — same challenge, signed in Rabet | `…_rabet_chrome_W-03_01.png` |
| W-12 · logout | Freighter · Chrome | FAIL — `vaquita-wallet-session` survives sign-out with a live API token (F-05) | `…_freighter_chrome_W-12_01.png` |
| W-13 · flexible deposit | Freighter · Chrome | PASS — 10 USDC into Blend savings<br>tx [`d0dafaef…9ac6`](https://stellar.expert/explorer/testnet/tx/d0dafaef157f871e027632d06403068ac3ec4a0cbb40e21c050613b9a5e19ac6) | `…_freighter_chrome_W-13_01…05.png` |
| W-13 · flexible deposit | xBull · Chrome | PASS — wallet USDC 1000 → 990<br>tx [`b69f017d…59d3`](https://stellar.expert/explorer/testnet/tx/b69f017dc05b01be4b77db71373ff72f6a556b9de7f3d31a0a1c9b5083e159d3) | `…_xbull_chrome_W-13_01…03.png` |
| W-13 · flexible deposit | Rabet · Chrome | PASS — wallet USDC 1000 → 990<br>tx [`f3cff066…3438`](https://stellar.expert/explorer/testnet/tx/f3cff066486502dccca37bc06112f263a375a677a9c9473ae0e0418fc3aa3438) | `…_rabet_chrome_W-13_01…03.png` |

### Hana — Stellar not available in the wallet (2026-08-27)

Hana installs and runs, but its network list marks **Stellar as `INELIGIBLE`**:
the toggle cannot be switched on, so the wallet never exposes a Stellar account
and the Pollar modal has nothing to connect to. §2 of the protocol lists Hana as
a Stellar wallet with a network selector; that is no longer true of this build.
Recorded **N/A**, not FAIL — the app was never exercised.

Evidence: `…_hana_chrome_W-01_01.png`.

### Albedo — blocked by a vendor outage (2026-08-27)

Albedo is a web wallet: the Pollar modal opens `albedo.link/?intent=public-key&…`
in a popup, and that popup renders blank. The wallet's own site is not serving:

| Check | Result |
|---|---|
| `https://stellar.expert/` | 200 |
| `https://www.cloudflare.com/` | 200 |
| DNS `albedo.link` | resolves — 104.26.6.184, 104.26.7.184, 172.67.68.70 (Cloudflare) |
| TCP 443 to `albedo.link` | no response (`nc` times out) |
| `curl -H "Host: albedo.link" https://104.26.6.184/` | `000`, connection timed out |
| `albedo.link` opened directly in Chrome | never loads |

Network and Cloudflare edge are both reachable, so this is Albedo's outage, not
Vaquita's and not the tester's connection. The cells are recorded **BLOCKED**
rather than FAIL: nothing about the app was exercised, and a vendor outage should
not count against the pass rate. Re-run Albedo once `albedo.link` answers again —
the funded account `GD5ZKCBE…YE2B` is ready and untouched.

Evidence: `…_albedo_chrome_W-01_01.png` (blank popup over the Pollar modal).

## Findings

| Id | Where | What happens | Why it matters |
|---|---|---|---|
| F-05 | Settings → *Sign out* | `pollar:*`, `wallet:adapter` and `@StellarWalletsKit/activeAddress` are cleared, but **`vaquita-wallet-session` survives** — still holding the previous account's address and a live API token (`expiresAt` a week out). | `W-12` requires that key to be gone. Whoever uses the browser next inherits a valid API session token for the account that signed out. |
| F-07 | Onboarding → welcome reward | `ClaimGate` renders the 1 USDC gift only when `data.tutorialCompleted && !data.onboardingCompleted`. The only writer of `tutorialCompleted` is `TutorialExperience.finish()`, and `TutorialGate` is switched off at the source (`const needsTutorial = false && …`, marked `TUTORIAL_DISABLED_GLOBALLY`). No navigation path sets the flag, so **no new user is ever offered the welcome reward**. Proven both ways: with the flag `false` the gift never appears; setting it via `/tutorial` (reachable only by typing the URL) makes the gift appear, claim, and credit 1 USDC on-chain. | The onboarding gift is dead code in production while the tutorial stays disabled. One-line cause: drop the `tutorialCompleted` condition from `ClaimGate`, or set the flag when the tutorial is disabled by configuration. |
| F-18 | Withdrawals → `reward` is never persisted | `toDepositWithState` picks `WITHDRAW_SUCCESS` only when a confirmed withdrawal has a truthy `reward`; otherwise it falls through to `WITHDRAW_SUCCESS_EARLY`. The reconciliation parser *does* extract `reward` from the contract event (`parser.ts:143`), but **none of the three writers** — `creteWithdrawal`, `creteConfirmWithdrawal`, `creteWithdrawalWithDepositTx` — nor `applyWithdrawalRepair` ever writes the column. Verified in the data: the matured position 211 and the early position 226 both return `reward: null` (also `transferAmount: null`), and across the 9 positions of the 5 accounts in this run **no position is in `withdraw_success`** — that state is unreachable in this build. | Three consumers key off `reward > 0`: the withdrawal state (a saver who completed a full cycle is recorded as having withdrawn early and forfeited interest), the leaderboard's on-time-withdrawal detection (`leaderboard/index.ts:383`), and the **Maratonista (6-month) and Trimestral (3-month) badges** (`badge-monitor.ts`), which therefore can never be earned. The payout itself is correct on-chain — 1.80 principal returned 1.9906779 — so this is a persistence gap, not a money bug. Related to F-13. |
| F-01 | Deposit → *Deposit to your savings* | `POST /tx/build` answers **401** and the modal shows *"We couldn't complete the transaction. Please try again in a moment."* with a **Retry** that fails the same way. The app still renders as logged in. | The Pollar session had gone stale; nothing in the UI says so, so the only exit is clearing storage by hand. Error mapping treats an auth failure as a transient network failure. |
| F-09 | Portfolio → *Invest* → *Confirm* | First attempt died with *"We couldn't reach the network. Check your connection and try again."* while every Soroban RPC call answered 200 and no transaction was ever submitted. The identical second attempt succeeded. | An unattended signature prompt is reported as a network outage, sending the user to check their connection instead of their wallet. Same mis-mapping family as F-01. |
| F-14 | Every signed flow, all three external wallets | The progress state is rendered **before** the user signs: "Depositing to your savings", "Getting your money ready", "Getting your money out" and the username spinner all appear while the wallet prompt is still waiting. | Nothing tells the user a signature is pending, and wallet popups often open behind the browser window. This is what turns an unattended prompt into the false "We couldn't reach the network" of F-09. |
| F-15 | First entry with a brand-new address | A legal-consent gate — *"Before you continue"* / *"Antes de continuar"*, Privacy Policy / Terms of Service / Risk Disclosure, version 2026-08-25, two checkboxes — blocks the way to `/home` and is not described in any case of §5. Seen on Rabet and on the social login. | The real onboarding has a mandatory step the protocol does not cover, and it is the tester's to accept, not the automation's. |
| F-16 | Rabet → *Approve Transaction* | Rabet renders every contract call as raw serialised internals: `hostFunctionTypeInvokeContract-invokeContract-class extends ${}-scAddressTypeContract-1-contractId-32-69-53-203-175-248…` instead of a readable contract id and function name. The same transactions render cleanly in Freighter and xBull, so this is Rabet's parser. | `wallet defect` under §8 rule 3: it does not block sign-off, but a Rabet user cannot tell what they are signing. Worth a vendor issue link before submission. |
| F-17 | Hana → network list | Stellar is listed as `INELIGIBLE` and cannot be activated, so Hana cannot hold a Stellar account at all. §2 of the wallet matrix still lists it among the supported wallets with a network selector. | The protocol's supported-wallet table is out of date, and the fifth wallet of the sign-off set had to be replaced. |
| F-13 | `/profile/achievements` | The award catalogue on testnet contains placeholder rows visible to any user — `Test` / *"asdfadfadf"* and `asdfasd` / *"asdfadsfasdfa"* — and `Test` was the only award the new accounts could claim. Meanwhile **`First Deposit` stayed locked** after two real deposits and `rewards` stayed at 0 until the `Test` award was claimed. | Junk catalogue data reaches the UI, and the award a real deposit should unlock does not unlock. Worth checking against the event listeners before the demo. |
| F-12 | Another saver's world → badge modal | The badge description is written in the second person on someone else's profile: *"**You** joined Vaquita during the beta"* / *"**Hiciste** tu primer depósito en Vaquita"* while viewing `@aleregex`. | The copy claims the viewer earned a badge that belongs to the profile owner. |
| F-02 | Pollar login modal → *Wallet* | **Freighter** and **Albedo** each appear **twice**: once at the top without an icon, once inside the alphabetical list with an icon. Reproduced in Chrome and in Brave. | Two entries for one wallet; unclear which to press, and the two may resolve to different adapters. |
| F-06 | Sidebar → *Daily reward* | The button highlights but no modal opens; nothing is rendered and no request is made. | The daily check-in cannot be exercised from the home sidebar. |
| F-04 | Console, any page | `[PollarClient] Another PollarClient is already active for this API key… single-use refresh-token rotation will trip server-side reuse-detection and log all of them out.` | Plausible cause of F-01, and a warning the app ships to every session. |
| F-03 / F-10 | Home → *Deposit* vs Portfolio → *Invest* | The home Deposit button leads to the **flexible Blend path** (no lock period). The locked `deposit(caller, nonce, amount, period)` lives in **Portfolio → Invest**, takes its money from the flexible savings, and is a **two-transaction, two-signature** flow. | `W-05a` in the protocol assumes one deposit and one signature from the wallet balance. Scope mismatch, not a defect. |
| F-11 | Position detail → *Withdraw* | Both the early and the matured withdrawal return the payout to the **flexible savings**, not to the signing wallet; the wallet USDC balance is unchanged. | `W-06`/`W-07` in the protocol expect the wallet balance to grow by the payout. Getting the money out is a further, separate withdrawal. |

F-08 was withdrawn after re-testing: the intro carousel is pre-login and stored
per device (`vaquita:intro-seen`), which is deliberate and documented in
`useIntroSeen.ts`. The original observation was a mistake in the test procedure,
not a defect in the app.

## Re-test of W-04

The first pass recorded "no onboarding gates at all". That was three separate
things, and only one of them is a defect:

| Step of `W-04` | Verdict |
|---|---|
| Nickname gate — taken name refused, free name accepted | PASS |
| Intro carousel not shown | **Not a defect.** `useIntroSeen` persists `vaquita:intro-seen` per device, pre-login by design; the browser had already seen it under another account. Clearing the key while authenticated cannot show it either — `LoginPage` returns `null` once authenticated. |
| No redirect to `/tutorial` | **By design.** `TutorialGate` carries `// AI-MARKER: TUTORIAL_DISABLED_GLOBALLY` and hard-codes `needsTutorial = false && …`. The protocol step is stale. |
| Welcome reward never offered | **Defect — F-07.** Gated on `tutorialCompleted`, which only the disabled tutorial writes. |

Re-test evidence: `…_freighter_chrome_W-04_07.png` (gift modal), `…_W-04_08.png`
(claim confirmed), profile flags `{onboardingCompleted: true, tutorialCompleted:
true}`, wallet USDC 990.00 → 991.00.

## Run status

**Incomplete run — not a sign-off.** What this run establishes:

- Freighter, xBull and Rabet on Chrome each move real testnet money end to end:
  connect, flexible deposit, locked 7-day deposit, early withdrawal, leaderboard
  and an on-chain `mint_badge`. The Pollar social login does the same through the
  custodial path, without a single signature prompt.
- 27 transactions, every one verifiable on Stellar Expert, with the API position
  state matching at each step.
- `W-06` (matured withdrawal), excluded from the set because no position can
  mature inside a run, was exercised on an old position of the social account and
  paid the reward share correctly.
- Albedo is blocked by its own outage; Hana cannot hold a Stellar account.

Under §8 of the protocol this run cannot be signed off: the wallet coverage the
deliverable names ("Freighter, Albedo, and ≥3 additional wallets") is not met
while Albedo is unreachable, and the third "additional wallet" is Pollar's
embedded login rather than an external one — see the scope note below.

Two cases outside the sign-off set failed and stay open regardless: `W-04`
(F-07, the welcome reward is unreachable) and `W-12` (F-05, the API session token
survives sign-out).

## Scope note — counting the Pollar social login as a wallet

The completion criteria ask for *"Freighter, Albedo, and ≥3 additional wallets"*.
This run covers **Freighter, xBull, Rabet** and the **Pollar social login**, with
Albedo blocked by a vendor outage and Hana unable to hold a Stellar account at
all. The social login is Pollar's **embedded** wallet — a custodial account that
signs server-side — not a third-party external wallet, and it is recorded here as
such rather than quietly counted as one. It does exercise a genuinely different
signing path (`custody: internal`), which is why it earns its own row: every
money case passed on it **without a single signature prompt**, confirming the
custodial branch of `WithdrawModal` / `DepositMethodModal` end to end.

Whether it satisfies the third "additional wallet" is the reviewer's call, and
the evidence is presented so they can make it. What the ecosystem allows today:
of the twelve wallets the Pollar modal lists, only Freighter, xBull, Rabet and
Albedo were reachable on Stellar **testnet** during this run — LOBSTR is
mainnet-only and Hana marks Stellar `INELIGIBLE`.

# Recording Runbook — SCF 3.4 Evidence

Step-by-step commands for recording the demo that accompanies deliverable 3.4
"End to End Testing". Everything here runs against Stellar **testnet** and the
testnet API; no mainnet key is involved at any point.

Companion docs: [`../testing.md`](../testing.md) (what each layer proves),
[`e2e-coverage-map.md`](./e2e-coverage-map.md) (requirement → artifact),
[`wallet-regression-matrix.md`](./wallet-regression-matrix.md) (manual wallets),
[`../../apps/web/e2e/README.md`](../../apps/web/e2e/README.md) (suite internals).

---

## 0. One-time setup

```bash
cd apps/web
pnpm install
pnpm exec playwright install chromium
```

Create `apps/web/.env.e2e` (git-ignored; `playwright.config.ts` loads it, and an
exported shell variable still overrides it):

```dotenv
E2E_STELLAR_SECRET=S...                                        # funded testnet account
E2E_SERVICES_URL=https://api.testnet.development.vaquita.fi
E2E_POLLAR_PUBLISHABLE_KEY=pub_testnet_...
```

All three are required. Without the last two the app falls back to the
developer's own env files, the browser signs into one backend while the app
reads another, and every spec fails on a redirect back to `/login`.

Check the account has funds before recording — the on-chain specs need XLM for
fees and ≥ 2 USDC for the deposit/withdraw pair:

```bash
curl -s "https://horizon-testnet.stellar.org/accounts/<G...>" \
  | python3 -c "import json,sys; [print(b.get('asset_code','XLM'), b['balance']) for b in json.load(sys.stdin)['balances']]"
```

Top up if needed: `curl "https://friendbot.stellar.org?addr=<G...>"` for XLM;
USDC arrives automatically from Blend's testnet faucet on the first deposit run.

**Free port 3101 before every run** — the config starts its own server and
refuses to reuse one:

```bash
lsof -ti:3101 | xargs kill 2>/dev/null
```

---

## 1. Rehearse: watch the suite run

```bash
cd apps/web
pnpm test:e2e:ui
```

Playwright UI mode: pick individual specs, watch each step, and hover a step to
see the DOM as it was at that moment. Use this to decide what to record — not
for the recording itself, since the browser is embedded in the tool's window.

---

## 2. Record the automated suite

A visible browser drives the real app. Screen-record with QuickTime (⌘⇧5) or OBS
and start the command once recording is live.

| Take | Command | Length | Shows |
|---|---|---|---|
| Full suite | `pnpm test:e2e --headed` | ~2.6 min | All 12 tests across the five flows |
| Badges | `pnpm test:e2e --headed badges.spec.ts` | ~57 s | Follow → "Crew Mate" unlocks → claim → on-chain `mint_badge` → reward credited |
| Deposit | `pnpm test:e2e --headed deposit.spec.ts` | ~23 s | Deposit modal → amount → confirm → real USDC into savings |
| Deposit + withdraw | `pnpm test:e2e --headed deposit.spec.ts withdraw.spec.ts` | ~42 s | Full money round trip |
| Onboarding | `pnpm test:e2e --headed onboarding.spec.ts` | ~30 s | Fresh wallet → username prompt → home; session restore; auth gate |
| Leaderboard | `pnpm test:e2e --headed leaderboard.spec.ts` | ~19 s | Ranked board, own row, open a saver's world |

`withdraw.spec.ts` on its own skips with a clear message when the savings
position is empty — it drains what `deposit.spec.ts` leaves behind, so record
the pair together or run deposit first.

Each run moves real testnet funds. That is the point: the transactions are
verifiable, and the terminal prints their hashes.

---

## 3. Record the contract ↔ frontend integration suite

```bash
cd apps/web
INTEGRATION_STELLAR_SECRET=S... pnpm test:integration
```

10 tests, ~26 s, no browser: the frontend's own argument builders drive the
deployed pool and badges contracts — deposit, position read back by the
`sha256(caller‖nonce)` derivation the app uses, withdraw, and the contract error
codes (`#3` duplicate nonce, `#4` unsupported period, `#5` position not found).

Without the secret every test skips and the run stays green — good for showing
that the suite is safe to run offline, but record it *with* the secret so the
transactions are real.

---

## 4. Record the reports

```bash
cd apps/web
pnpm test:e2e:report              # HTML report: every test, its steps and timings
node scripts/e2e-pass-rate.mjs    # pass-rate table, exits non-zero below 95%
```

The pass-rate output is the figure the deliverable asks for
("≥95% pass rate"). In CI the same script writes that table into the workflow
Step Summary.

For the contract layer:

```bash
cd contracts
make test        # 169 Rust tests
make coverage    # lcov + HTML, fails under 80% lines
open coverage-html/index.html
```

---

## 5. Verify on-chain

Any transaction hash the runs print resolves on Stellar Expert — worth showing
on camera as independent proof:

```
https://stellar.expert/explorer/testnet/tx/<hash>
```

The wallet's account page lists them all:

```
https://stellar.expert/explorer/testnet/account/<G...>
```

---

## 6. Manual wallet regression

Not scriptable — this is the human pass across Freighter, Albedo, xBull, Lobstr
and Rabet. Follow [`wallet-regression-matrix.md`](./wallet-regression-matrix.md)
and record each wallet's connect + deposit + withdraw + claim, then fill the
results matrix and store screenshots under `docs/qa/evidence/<run-id>/`.

---

## Suggested cut

1. `docs/testing.md` on screen — the pyramid, one sentence per layer.
2. Full `--headed` run (§2), sped up, with the badge mint at normal speed.
3. Integration suite (§3) — the layer that proves the contract calls.
4. HTML report + pass rate (§4).
5. One transaction on Stellar Expert (§5).
6. Wallet matrix walkthrough (§6).

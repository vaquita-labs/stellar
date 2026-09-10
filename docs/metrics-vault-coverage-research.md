# Making the metrics dashboard vault-aware

Research note — 2026-09-09. Survey only, no code changed.

**Premise:** the cohort grid counts only locked pool deposits, because `deposits` is the only
table anything writes. The same blind spot runs through most of the dashboard. This note
inventories every panel, says what "vault + locked" would mean for each, and grades the
difficulty — which turns out to be dominated by a single structural fact.

---

## 1. The one fact that decides everything: levels vs. events

Locked deposits have an **event ledger**. The vault has **snapshots**.

| | Locked pool | Flexible vault |
|---|---|---|
| Written by | `createDeposit` → `deposits` row per `VaquitaPool::deposit()` | nothing — `passiveDeposit()` is a direct on-chain call, the client only invalidates its own caches |
| Grain | one row per event, with wallet + amount + timestamp | aggregates and current balances |
| History | full, since day one | none per wallet |

Everything downstream follows from that. A metric that asks **"how much is there?"** can be made
vault-aware today. A metric that asks **"who did what, when?"** cannot be — not because the SQL is
hard, but because the rows do not exist.

### What vault data actually exists

| Source | Grain | History? | State |
|--------|-------|----------|-------|
| `vault_tvl_snapshots` | per **vault**, aggregate `total_managed` | ✅ append-only | Live in all 3 envs. Sampled ≤ every 10 min, but **piggy-backed on user traffic** (fired from the APY read path in `apy.ts:85`) — no traffic, no samples |
| `wallet_balances.vault_usdc` | per **wallet** | ❌ `@@unique([walletAddress, tokenId])` — one row, overwritten | Refreshed **lazily**, when a wallet interacts with the app; the sweep workflow is `workflow_dispatch` only and gated on `WALLET_BALANCE_REFRESH_ENABLED` |
| `wallet_balances.vault_usdc_hours` | per **wallet**, monotonic integral | partial — a running total, not a series | Usable as "has this wallet **ever** held vault balance", not *when* |
| `vault_apy_snapshots` | per vault | ✅ | **Migration never applied anywhere** (`20260820`) |
| PostHog `direct_blend_deposit_successful` | per event, with amount | ✅ | **Incomplete** — only `DepositMethodModal.tsx:162` fires it. `useAutoInvest`, `usePassiveMigration` and `PositionWithdrawSheet` call `passiveDeposit()` with no tracking at all |

**There is precedent for the fix.** `depositorsPage` in `queries/deposits.ts` already does it right —
a `full outer join` of `wallet_balances` and `deposits` keyed on wallet, with its own comment
naming the trap: *"Ranking either source alone silently hides half the depositors — which is
what the old `topDepositors` did."* That join is the template for every T2 item below.

---

## 2. Difficulty tiers

| Tier | Meaning | Typical cost |
|------|---------|--------------|
| **T1** | Relabel only. The number is correct; the label overclaims. | ~1 h for all of them together |
| **T2** | SQL only, against data that exists today. Level metrics. | 2–4 h each |
| **T3** | SQL + a partial derivation (`vault_usdc_hours > 0`, balance-as-of). Answers a slightly different question, honestly. | 1–2 d each |
| **T4** | **Blocked.** Needs per-wallet vault history or events that no table holds. Migration + writer + then wait for data to accumulate. | see §4 |

The T1/T4 split is the important one. A T1 relabel is not a cop-out — half the panels are
*correct* readings of locked deposits that merely present themselves as readings of "deposits".
Renaming them is honest, immediate, and removes most of the way this misleads today.

---

## 3. Panel inventory

Legend: ✅ already correct · 🏷️ mislabelled · ⚠️ understated · 🚨 materially wrong

### Overview (`(dashboard)/page.tsx`)

| Panel | Now | Issue | Vault version | Tier |
|-------|-----|-------|---------------|------|
| Total users, New users | profiles | ✅ | — | — |
| **Depositors** | `deposits` distinct wallets | ⚠️ | + wallets with vault balance | **T3** |
| **Deposit volume** | `sum(amount)` | ⚠️ | + vault inflow | **T4** |
| Vault TVL | `vault_tvl_snapshots` | ✅ | already vault | — |
| Locked principal | ledger | ✅ | correctly scoped | — |
| **Activation** | `activated_7d` — a *locked* deposit ≤7 d | 🚨 | a user who funds the flexible vault reads as never activated | **T3** |
| Chart: Deposit volume | ledger | ⚠️ | stacked locked + vault | **T4** |
| Chart: Vault TVL / Locked principal | both present | ✅ | consider one stacked "Total TVL" | **T2** |

### Deposits (`deposits/page.tsx`)

| Panel | Now | Issue | Vault version | Tier |
|-------|-----|-------|---------------|------|
| Deposit volume, Deposits, All-time volume | ledger | 🏷️ | rename to "Locked …" | **T1** |
| Depositors | ledger | ⚠️ | + vault holders | **T3** |
| Vault TVL / Locked principal | both | ✅ | — | — |
| **Repeat depositors** | `having count(*) >= 2` on `deposits` | 🚨 | a lock-then-vault saver is counted as one-and-done | **T4** |
| Chart: Deposits & depositors | ledger | ⚠️ | second series | **T4** |
| **Chart: Inflow vs outflow** | ledger both sides | 🚨 | vault flows are invisible in both directions | **T4** |
| **Chart: Volume by lock period** | `group by lock_period` | ⚠️ | add a **"Flexible"** bucket beside 30/90/180 d — arguably the single most informative addition on the page, and the `active` column can be filled from `wallet_balances` today even if `volume` cannot | **T2** (active) / **T4** (volume) |
| Table: Depositors | full outer join | ✅✅ | **already vault-aware** | — |

### Users (`users/page.tsx`)

| Panel | Now | Issue | Vault version | Tier |
|-------|-----|-------|---------------|------|
| Active depositors | ledger, in range | ⚠️ | + vault activity | **T4** |
| **Activated ≤7d** | locked deposit ≤7 d of signup | 🚨 | the headline activation number, and the flexible vault is the path the deposit sheet offers *first* to non-web3 users | **T3** |
| **Chart: Signup → deposit funnel** | "Tried a deposit" / "Deposit confirmed" from `deposits` | 🚨 | the funnel's last two steps drop everyone who chose flexible | **T3** |
| Table: Top referrers → `activated` | ledger | ⚠️ | same predicate as activation | **T3** |

### Retention (`retention/page.tsx`)

| Panel | Now | Issue | Vault version | Tier |
|-------|-----|-------|---------------|------|
| **Repeat-deposit cohorts** | `deposits`, repeat only | 🚨 | the panel that prompted this note | **T4** |
| **Returning depositors** | `count(*) >= 2` | 🚨 | same as Repeat depositors | **T4** |
| **Time to 1st deposit** | median to first locked deposit | 🚨 | measures time-to-*lock*; a vault-first user never registers | **T3** |
| Early withdrawals, Open positions, Withdrawals early vs on time | lock semantics | ✅ | the vault has no lock — these are locked-only *by definition*, leave them | — |
| Principal withdrawn | ledger | 🏷️ | rename "Locked principal withdrawn" | **T1** |
| **Yield paid out** | `sum(interest)` on withdrawals | ⚠️ | excludes all vault yield, which is most of the yield the product earns | **T3** |

### Campaigns (`campaigns/page.tsx`)

| Panel | Now | Issue | Vault version | Tier |
|-------|-----|-------|---------------|------|
| **Activated / Depositors / Volume** | `deposits` | 🚨 | campaign ROI is understated precisely where it matters — a campaign-acquired, non-web3 user is the *most* likely to use the flexible vault | **T3** (converted) / **T4** (volume) |

### Weekly report (`report/page.tsx`, `lib/report.ts`)

Same ledger CTEs (`report.ts:70`), plus `vaultTvlCurrent()` for the TVL line. `deposits`,
`depositors` and `new_depositors` inherit every issue above — **T1** to relabel, then whatever
the underlying panels become.

### Engagement, Ramps

**Not affected.** Badges, follows, check-ins, map items and push are wallet-independent; ramps
measure fiat settlement, a separate concern. One optional idea: a "where did the on-ramped money
go" split (locked / vault / sitting idle) would close the loop between the ramps and deposits
pages — **T2** from `wallet_balances` today.

### Tally

**23 panels affected.** 4 are T1 relabels, 3 are T2, 8 are T3, 8 are T4.
---

## 4. The unlock: persist vault activity in the DB

Every T4 item needs the same thing — **per-wallet vault activity with a timestamp**. The
decision taken here (2026-09-09) is to **back it with our own tables**, written the way
`deposits` is written, and to keep the chain out of every read path. This reverses the
explicit deferral in `docs/passive-defindex-vault-spec.md` ("**No DB persistence** for passive
deposits… No `deposits` rows, no new columns, no reconciliation… No event indexing"), which
should be amended as part of the work rather than left contradicting the code.

### 4.1 What the `deposits` pattern actually is

It is worth being precise, because "do it like deposits" is three things, not one:

| Leg | Locked pool | Cost per user action |
|-----|-------------|----------------------|
| 1. **Client writes intent** | `POST /api/v1/deposit` → row at `initiated` (`createDeposit`, `services/deposit/index.ts:160`) | one HTTP call |
| 2. **Server verifies before confirming** | `POST /api/v1/deposit/confirm` — *"the server verifies the hash on chain before writing, so it can refuse (409)"* | **one on-chain read** |
| 3. **Reconciler replays events** | `apps/reconciler/src/reconcile.ts`, cursor in `config.reconciliation_state`; `applyDepositRepair` **creates** missing rows from the event itself | one batched scan per cron tick, amortised |

Leg 3 is what makes leg 1 safe to trust. Without it, a client that dies between signing and
confirming leaves a row stuck at `initiated` forever and nobody notices. Note that leg 3 is
*also* an on-chain read — but a cursor-based batch scan on a schedule, not a read per request.
That is the shape that matches "fetch as little as possible from on-chain": **reads move off
the request path and onto a cron, and the dashboard only ever touches Postgres.**

### 4.2 Four ways the vault is not the pool

Copying the three legs verbatim does not work. The differences are structural, not incidental:

1. **No `deposit_id`.** A pool deposit carries a caller-chosen `deposit_id` that both the row
   and the on-chain `Position` are keyed by, which is what lets the matcher join an event to a
   row unambiguously. The vault's `deposit(amounts_desired, amounts_min, from, invest)` has no
   such handle. **The join key has to be the transaction hash**, which is fine — it is unique,
   the client knows it the moment Pollar returns, and the event carries it — but it means a row
   with no hash yet (leg 1) is unmatchable, so the `initiated` state buys much less here.
2. **No position list to read back.** The pool exposes `Positions(deposit_id)`; the vault
   exposes only a **share balance**. So a "read the truth back" reconciler for the vault can
   only compare a balance to a running total — it **detects** drift, it cannot **repair** a
   specific missing row the way `applyDepositRepair` does.
3. **~7-day event retention *from RPC*.** `resolveReconciliationLedgerRange` clamps to the
   RPC's `oldestLedger`, and `dune-ingest.yml` puts the number on the record: *"~7-day
   (120960-ledger) Stellar testnet RPC retention window."* A reconciler-style job built on
   Soroban RPC therefore **cannot backfill** — history would start on its deploy date, the
   same as a client-side writer's, for considerably more work. This is the single strongest
   argument against building one (§7).
4. **The same vault holds both products.** Locked deposits reach the DeFindex vault through
   the pool contract; flexible deposits go straight from the user. Any vault-event indexer
   must filter on `from != vaquita_contract_address` or it will count every locked deposit a
   second time.

### 4.3 The recommended shape: two tables, one writer each

**Table 1 — `vault_flows` (the event ledger).** One row per user-initiated vault deposit or
withdrawal, mirroring `createDeposit`'s call shape:

> **The client is the writer, and §7 trims what it has to do.** At this scale `vault_flows`
> needs no `initiated` → `confirmed` handshake: write one row, already confirmed, on the tx
> hash the wallet returned. §4.4 and §4.5 stay required reading — they are what the client has
> to get right, and `flow_kind` is not optional.

```
wallet_address, token_id, direction ('deposit' | 'withdraw'),
amount, transaction_hash (unique), flow_kind, status, confirmed_at, created_at
```

- Written from all **nine** vault mutation call sites (see §4.4) via one new endpoint.
- `status` gets the same `initiated → confirmed` treatment, and the confirm handler does the
  same on-chain hash verification `POST /deposit/confirm` already does — **one read per
  deposit**, not per page view. That is the single unavoidable chain read, and it is the one
  that makes the row mean something.
- `flow_kind` distinguishes `external` (money entering or leaving Vaquita) from `internal`
  (money moving between the two products). It is not optional — see §4.5.

**Table 2 — `wallet_balance_history` (the levels series).** One append-only row per wallet per
successful refresh, from `refreshWalletBalances`:

```
wallet_address, token_id, blend_usdc, vault_usdc, vaquita_positions, observed_at
```

- **Zero new on-chain reads.** `refreshWalletBalances` already fetches each wallet's vault
  balance; today it overwrites `wallet_balances` and throws the previous value away. This is
  one extra `INSERT` next to the existing `UPSERT`, in the same transaction so the pair cannot
  diverge.
- **A sample, not a series.** There is no cron: `.github/workflows/refresh-wallet-balances.yml`
  is `workflow_dispatch` only, because sequential reads against the rate-limited public RPC
  took ~1.7 s per wallet and concurrency of 5 or more drew 75-100% HTTP 429s. Balances refresh
  lazily instead, when a wallet interacts with the app. Row density therefore follows traffic,
  exactly like `vault_tvl_snapshots`: a wallet that never opens Vaquita produces no rows, and
  a gap between two rows is not evidence the balance sat still.
- It is a **drift check**, not the record. A wallet whose `vault_flows` sum diverges from its
  balance trajectory (beyond yield) is a wallet with a probably-missing row. That is weaker
  than the audit anchor a fixed-interval series would be, and it is why the ledger — not this
  table — is the record.

The two together give what the pool has: an event ledger for "who did what, when", and an
independent truth source to check it against. Neither adds a Soroban call to a request path,
and `apps/metrics` stays DB-only.

**Optional third leg — the vault-event scan.** A `--job vault` mode on the existing reconciler
reading DeFindex `deposit`/`withdraw` events filtered on `from != pool contract`, keyed by tx
hash. It upgrades drift *detection* into drift *repair* within the 7-day window. Worth adding
once flows are moving; **not** worth blocking the first release on, because table 2 already
tells you whether you have a problem.

### 4.4 The nine call sites that must record

A ledger with holes is worse than no ledger, because it looks complete. Every one of these
writes today without telling the server anything:

| Call site | Call | Flow kind |
|---|---|---|
| `DepositMethodModal.tsx:157` | `vaultDeposit` | external in |
| `useAutoInvest.ts:158` | `vaultDeposit` | external in (idle funds) |
| `usePassiveMigration.ts:78` | `vaultDeposit` | **internal** (legacy Blend → vault) |
| `PositionWithdrawSheet.tsx:158` | `vaultDeposit` | **internal** (locked → flexible) |
| `DepositPanel.tsx:246` | `passiveWithdraw` | external out |
| `SendFiatModal.tsx:212` | `passiveWithdraw` | external out |
| `SendFiatRampModal.tsx:817` | `passiveWithdraw` | external out (off-ramp) |
| `InvestModal.tsx:144` | `passiveWithdraw` then `createDeposit` | **internal** (flexible → locked) |
| `usePassiveMigration.ts:67,93` | `directBlendWithdraw` | **internal** |

The maintenance risk is real and should be designed against, not just documented: a tenth call
site added next quarter that forgets the write creates a silent gap. The cheapest guard is to
make the recording live **inside** `passiveDeposit()` / `passiveWithdraw()` in
`networks/stellar/vaultDirect.ts` — the two functions every call site already goes through —
with `flowKind` as a required argument, so a new caller cannot compile without stating it.

### 4.5 Internal transfers double-count

Four of the nine are money moving between Vaquita's own products, not money arriving. Two
matter most:

- `InvestModal.tsx:144` — `passiveWithdraw` **then** `createDeposit`. Naively counted, this is
  one vault outflow *and* one locked deposit inflow: total volume goes up by twice the amount
  a user did not add.
- `PositionWithdrawSheet.tsx:158` — the reverse, locked → vault.

Note that the locked half of these already lands in `deposits` today and is *already* being
counted as a fresh deposit by every panel. So this is not a new problem the vault ledger
introduces; it is an existing overcount the vault ledger finally makes visible. The
`flow_kind` column is what lets "Total deposit volume" mean *external inflow* and the cohort
grid stop congratulating itself when someone shuffles money sideways.

### 4.6 Rejected alternative: derive it from balances only

Snapshot every wallet's `vault_usdc` periodically and infer activity from the deltas — table 2
without table 1. It is genuinely cheaper and it does unblock cohorts and retention, redefined
as *"was holding a vault balance in week N"* rather than *"deposited in week N"*.

It is rejected as the whole answer for two reasons. A delta between two readings cannot separate
a deposit from a withdrawal from accrued yield, so **volume and inflow/outflow stay
unanswerable** — and those are the numbers the campaign and weekly-report panels need. And a
deposit followed by a withdrawal inside one window is invisible entirely. Since the readings are
lazy rather than scheduled, that window is not even a known length.

It survives as **table 2**, where it is doing the job it is actually good at: an independent
level series that audits the ledger. That is a better role for it than being the ledger.


## 5. Revised order

| # | Work | Tier | Cost | Why here |
|---|------|------|------|----------|
| 1 | Relabel the 4 locked-only panels ("Deposits" → "Locked deposits", etc.) | T1 | 1 h | Removes most of the active misleading, today, for nothing |
| 2 | `wallet_balance_history` + the extra `INSERT` in `refreshWalletBalances` | — | ½ d | **Do this first.** Zero on-chain cost, and the clock starts the day it ships — every day it waits is a day of history that does not exist |
| 3 | "Flexible" bucket in **Volume by lock period**; stacked **Total TVL** | T2 | ½ d | Makes the vault visible on the page people actually open |
| 4 | Fix **Activation** and the **signup funnel** to accept either deposit kind | T3 | 1 d | The most consequential wrong number on the dashboard; `vault_usdc > 0` answers it today, before any ledger exists |
| 5 | **`vault_flows` written from the 9 call sites** (§4.4) via one new endpoint | — | 2 d | The ledger. Its history begins the day it ships, so shipping it is the only way to get one |
| 6 | Rebuild the cohort grid and Returning/Repeat depositors on `deposits ∪ vault_flows` | T4→T2 | 1 d | The original question, answered — from Postgres alone, once the ledger has run a few weeks |
| 7 | Campaign conversion + vault yield; volume split external/internal | T3 | 1 d | ROI and the real earnings number |
| 8 | *Optional:* a scheduled gap check against `wallet_balances` deltas | — | ½ d | Detects a wallet whose balance moved with no `vault_flows` row. Detects only — see §6 |
| 9 | Amend `docs/passive-defindex-vault-spec.md` | — | 1 h | The "no DB persistence" section is now false; leaving it invites someone to undo this |

Steps 1–2 are half a day and should not wait for the rest. Both series — the balance history
in step 2 and the flow ledger in step 5 — start on their deploy date and cannot be filled in
backwards (§6), so every day either one waits is a day that will always be missing from the
charts. That is the whole argument for the ordering.

---

## 6. Four caveats for whoever implements this

- **Always filter `wallet_balances` by supported `token_id`.** Production carries 45 stale rows
  for a retired token on the same vault as the live one; an unscoped `SUM(vault_usdc)` double-counts.
  `depositorsPage` already does this and says why — copy it.
- **Vault numbers are snapshots and must be labelled as such.** Both `vault_tvl_snapshots` and
  `wallet_balances` are sampled off user traffic, so a quiet period leaves gaps; the balance
  sweep workflow is manual dispatch only and gated on `WALLET_BALANCE_REFRESH_ENABLED`. Show
  `scraped_at` / `fetchedAt` beside any vault figure, as
  `sampleAge()` already does. A stale reading presented as live is a worse bug than a missing one.
- **History is not backfillable.** Soroban RPC keeps roughly 7 days of events
  (`dune-ingest.yml`: *"~7-day (120960-ledger) Stellar testnet RPC retention window"*),
  `wallet_balances` keeps one row per wallet with no past, and a client-side writer by
  definition starts on its deploy date. Whichever writer ships, the series begins then. The
  vault's activity before that date is not recoverable from anything this repo reads today.
- **A gap check can detect, but never repair.** The vault exposes a share balance, not a
  position list (§4.2), so comparing `wallet_balances` deltas against `vault_flows` can tell
  you a row is missing but cannot reconstruct its amount, direction or timestamp. Design the
  job as an alert, not as `apps/reconciler`'s repair pass, and do not let a panel imply the
  ledger is self-healing.

---

## 7. Keeping this proportionate to under 1000 users

The `deposits` pattern (§4.1) has three legs: a client write, a server-side confirmation, and a
scheduled reconciler that replays chain events and repairs rows. `vault_flows` should copy the
first leg and skip the other two.

**Write one row, already confirmed.** The wallet hands back a transaction hash on success.
Post it to the new endpoint with `status = 'confirmed'` and be done. `deposits`' `initiated` →
`confirmed` handshake exists because a locked deposit carries a caller-chosen `deposit_id` that
has to be matched against chain state; the vault has no such id (§4.2), so the second leg would
be a Soroban simulation per deposit that confirms only what the hash already told us.

**Do not build a reconciler for this.** It cannot do its job here. `apps/reconciler` repairs
deposit rows because the pool exposes a per-position list to compare against; the vault exposes
a single share balance, so a job can notice a wallet's balance moved without a matching row but
cannot recover what that row should have said (§6). And its event source expires after ~7 days
anyway. A cheap daily query for *"wallets whose `vault_usdc` changed with no `vault_flows` row
in the window"* is worth having as an alert. Anything more is building a repair pass that has
nothing to repair with.

**Also not worth it at this scale:** a streaming indexer, a webhook subscription, or anything
holding a connection open. At a handful of vault transactions a day, the client write plus a
daily alert is the entire reconciliation story.

**Where the real risk is, since it is not throughput.** A dropped write — browser closed after
signing, failed POST, tab killed — is silent and permanent. Two cheap mitigations: retry the
POST from the client on failure, and treat the balance-delta alert as the thing that tells you
how often it happens. If the alert stays quiet for a month, the second leg was never needed. If
it fires regularly, that is the evidence for building more, and it will say exactly how much.

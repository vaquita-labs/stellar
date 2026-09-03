# Passive Yield via a Dedicated DeFindex Vault — Implementation Spec

## Goal

Replace the current **direct-to-Blend** passive-yield deposit with deposits into the
**Vaquita DeFindex vault** — the same vault the locked pool already uses. This gives
the position a Vaquita-owned on-chain home (segregated from the user's other Blend
activity) while DeFindex handles share accounting and yield. Users still get pure
yield with no lock.

> **Why sharing the vault with the pool is safe:** the DeFindex vault is itself a
> token — vault shares ("df-tokens") are an SEP-41 balance held **per address**
> (`balance(id)`). Passive users custody their **own** df-tokens in their **own**
> wallet; the pool contract custodies the pool's df-tokens at the pool address. A
> passive user's position is exactly `balance(userWallet)` and never touches pool
> shares. Same vault, cleanly segregated by holder.

## Scope

**In:**
- New on-chain read/write layer for the Vaquita DeFindex vault.
- Swap the passive deposit + withdraw UI from Blend to the vault.
- A lazy, guided migration of legacy direct-Blend balances into the vault.
- Keep the legacy Blend read + withdraw path indefinitely.

**Out (explicitly deferred):**
- **No DB persistence** for passive deposits — balance, TVL, and migration state are
  all read on-chain. No `deposits` rows, no new columns, no reconciliation.
- **No gamification** — passive deposits earn no rewards/badges/XP and feed no
  product metrics (pure-yield product, outside the game). No event indexing.
- **No DefiLlama** adapter/listing work.
- **No DeFindex-APY display** — show the underlying **Blend APY** for now.
- The Vaquita **pool** (locked positions) is untouched by this work.

## Background

Today, passive deposits go straight to the Blend pool from the user's wallet
(`apps/web/src/networks/stellar/blendDirect.ts` → `directBlendSupply`), and the
balance is read on-chain via `useBlendPosition` (`@blend-capital/blend-sdk`
`PoolV2.loadUser().getCollateralFloat()`). The position lives in the user's own
Blend account, so it's not attributable to Vaquita and commingles with any Blend
supply the user made elsewhere. Routing through a dedicated Vaquita DeFindex vault
fixes both.

---

## 1. Config

The vault address comes from existing config — **no new field needed**:

- `usdc token.defindexVaultContractAddress` — the Vaquita DeFindex vault (shared
  with the locked pool). This is both the deposit target and the df-token whose
  `balance(user)` is the passive position.
- `token.contractAddress` — USDC SAC (the vault's underlying asset, 7 decimals).
- Reuse `getRpcUrl()` / `getNetworkPassphrase()` from `networks/stellar/kit.ts`.

## 2. DeFindex vault interface

Confirmed against the deployed vault (SDK `22.0.6`). The vault is a **single-asset
(USDC)** DeFindex vault and is itself an SEP-41 token (the df-token). All asset
vectors are **length 1**.

**Writes:**
- `deposit(amounts_desired: Vec<i128>, amounts_min: Vec<i128>, from: Address, invest: bool) -> Result<(Vec<i128> amounts, i128 df_tokens_minted, Option<...> allocations), Error>`
  — pass `invest: true` so funds are put to work immediately.
- `withdraw(withdraw_shares: i128, min_amounts_out: Vec<i128>, from: Address) -> Result<Vec<i128> amounts_out, Error>` — burns the caller's df-tokens.

**Reads (via RPC simulate):**
- `balance(id: Address) -> i128` — the address's df-token (share) balance.
- `get_asset_amounts_per_shares(vault_shares: i128) -> Result<Vec<i128>, Error>` —
  USDC value of a given share count (index 0). *(Note: it also bumps the entry TTL,
  so it's not a pure view — harmless under simulation, which never commits.)*
- `total_supply() -> i128` and `fetch_total_managed_funds() -> Vec<CurrentAssetInvestmentAllocation>`
  (use `[0].total_amount`) — for the USDC→shares conversion on partial withdraw.
- `get_fees() -> (u32 vault_fee_bps, u32 protocol_fee_bps)` — for a future net-APY;
  not shown now (§7).
- `decimals()` — df-token decimals (shares are opaque i128; value always comes from
  `get_asset_amounts_per_shares`, so we never convert df-tokens to USD directly).

**Auth (no `approve` needed):** `deposit`/`withdraw` take `from` and call
`from.require_auth()`, then move USDC via the SAC `transfer` as an authorized
sub-invocation. The user signs the invoke via Pollar, which satisfies both the
outer and the nested transfer auth — same model as `directBlendSupply`. This is an
**auth-based** transfer (not allowance/`transfer_from`), so **no separate `approve`
step**.

**Error codes to surface** (subset of the vault's `Errors`, for a `VAULT_ERROR_KEYS`
map mirroring `POOL_ERROR_KEYS`):

| Code | Name | User-facing meaning |
|-----|------|---------------------|
| 412 | `InsufficientBalance` | Not enough USDC / shares |
| 124 | `AmountOverTotalSupply` | Withdraw shares exceed supply (stale read) |
| 114 | `InsufficientManagedFunds` | Vault can't cover the withdrawal right now |
| 451 | `AmountBelowMinDust` | Amount too small |
| 452 / 453 | `UnderlyingAmountBelowMin` / `BTokensAmountBelowMin` | Slippage floor not met — retry |
| 410 / 417 | `NegativeNotAllowed` / `OnlyPositiveAmountAllowed` | Invalid amount |
| 401 / 418 / 130 | `NotInitialized` / `NotAuthorized` / `Unauthorized` | Config/auth issue — shouldn't reach users |

452/453 (slippage) → retry with a fresh read; 114/124 → refetch and retry.

---

## 3. Read layer — `useDefindexVaultPosition`

New hook mirroring `useBlendPosition.ts` (same money-safety options), but reading
the vault by RPC simulate (no DeFindex JS SDK; reuse the simulate pattern from
`poolQueries.ts` — build tx → `simulateTransaction` → `scValToNative(retval)`).

```ts
// apps/web/src/core-ui/hooks/useDefindexVaultPosition.ts
// shares  = simulate vault.balance(user)            -> i128
// usdcRaw = simulate vault.get_asset_amounts_per_shares(shares)[0] -> i128
// usdc    = usdcRaw / 10^decimals
interface VaultPosition { usdc: number; shares: bigint; apy: number; }
```

- `apy`: **Blend supply APY** (from the existing Blend reserve read used by
  `useBlendPosition`, or `blendConfigForToken`) — not the vault's net APY. See §7.
- Reuse the live-projection helpers (`useBlendUsdc` / `projectBlendUsdc` /
  `useLiveBlendUsdc`) pattern so the displayed balance ticks; generalize them or
  clone for the vault.
- Keep the same react-query hardening: `keepPreviousData`, `staleTime: 60_000`,
  `retry: 4` w/ backoff, refetch on mount/focus/reconnect. **Never flash to $0.**

## 4. Write layer — vault deposit/withdraw

Add to a new `apps/web/src/networks/stellar/vaultDirect.ts` (parallels
`blendDirect.ts`), invoking via Pollar (`invokeViaPollar` in `sorobanTx.ts`):

```ts
export const vaultDeposit = ({ address, vaultId, usdcId, amount, decimals }) =>
  // vault.deposit([amount_raw], [amount_min], from=address, invest=true)
  //   amount_min = amount_raw with slippage (see §8)

export const vaultWithdrawShares = ({ address, vaultId, shares, minOut }) =>
  // vault.withdraw(shares, [minOut], from=address)

export const vaultWithdrawAll = ({ address, vaultId }) =>
  // read shares = balance(address), then withdraw(shares, [minOut], address)
```

- **Withdraw all** → read the user's full `balance(user)` fresh at execution and
  withdraw exactly that; don't trust a stale UI number.
- **Partial (USDC amount)** → convert USDC→shares:
  `shares = floor(usdcRaw * total_supply() / fetch_total_managed_funds()[0].total_amount)`.
  **Round shares DOWN** and **cap at `balance(user)`** so you never request more than
  the user holds. Then set `min_amounts_out` from the requested USDC minus the
  withdraw tolerance (§8). (`get_asset_amounts_per_shares(shares)` gives the exact
  USDC that share count is worth — use it to set `min_amounts_out` precisely.)

---

## 5. Deposit flow (UI)

Replace `directBlendSupply` with `vaultDeposit` wherever the passive/"invest
passively" deposit is triggered (`DepositPanel` / `DepositModal` / `useAutoInvest`):

1. User picks amount (validated against wallet USDC + trustline check — reuse the
   existing precondition used for Blend).
2. **Migration gate (see §6)** — if a legacy Blend balance exists, run that first.
3. `vaultDeposit(...)` via Pollar (build→sign→submit).
4. On success: invalidate `['defindex-vault-position', ...]` so the balance
   refreshes. No API/DB call.

## 6. Migration flow (lazy + guided, all-or-nothing)

Triggered when a user with a legacy Blend balance enters the passive area.
**Read the live Blend balance each time** (`useBlendPosition` / `getBlendUsdcBalance`)
so the flow is self-derived and resumable. **No partial migration** — the entire
Blend balance either moves to the vault or leaves to the wallet.

```
blendBalance = getBlendUsdcBalance(user)      // on-chain, live
if blendBalance > 0:
    BLOCKING CHOICE — "You have $Y in Blend. To continue you need to move it."
      • [Migrate to Vault]     → withdraw ALL from Blend, then deposit ALL to vault
      • [Withdraw to wallet]   → withdraw ALL from Blend, exit (no vault deposit)
else:
    normal passive deposit (§5)
```

- **All-or-nothing (decision 4):** you cannot leave part in Blend. Both branches
  call `directBlendWithdraw(all)`; they differ only in whether a `vaultDeposit`
  follows.
- **Migrate branch = two non-atomic txs** (Blend withdraw, then vault deposit). If
  the user completes the withdraw and bails before the deposit, the next entry
  re-reads `blendBalance == 0` → the blocking choice disappears → they resume at a
  normal deposit with the USDC already in-wallet. **No stored migration state.**
- **Deposit amount on the migrate branch** = `withdrawn_blend + chosen_new_amount`
  (chosen may be 0 = migrate only). Deposit exactly that — never sweep the whole
  wallet balance.
- **Borrow-backed Blend → blocked entirely.** Since partial isn't allowed and a
  borrow prevents a full Blend withdraw (health-check revert), detect the open
  borrow up front and block both branches with "Repay your Blend borrow before you
  can move these funds." Don't dead-end mid-flow.
- **Withdraw-to-wallet branch** is also the standing path for a legacy user who just
  wants out without reinvesting (§9).
- **Transparency:** the prompt names the exact amount ($Y). Moving it withdraws the
  user's *entire* Blend position — including any non-Vaquita supply, which can't be
  split out because none was ever recorded.

## 7. APY display

Show the **current Blend supply APY** (as `useBlendPosition` reads today), not the
DeFindex vault's net APY. **Caveat to accept consciously:** this over-states the
real net yield (DeFindex takes a fee), so the balance will accrue slightly slower
than the advertised rate. Fine for acquisition; revisit when DeFindex APY is in
scope.

## 8. Slippage / min amounts

Because this is a **single-asset USDC vault**, deposit and withdraw behave
differently:

- **Deposit `amounts_min` = `amounts_desired` (exact, 0 slippage).** A single-asset
  vault always deposits the full amount (the ratio-balancing / `NoOptimalAmounts`
  logic only applies to multi-asset vaults), so a tolerance here would only *lose
  the user money for nothing*. Set them equal. **If the vault ever becomes
  multi-asset, this must change.**
- **Withdraw `min_amounts_out` = expected USDC × (1 − `WITHDRAW_SLIPPAGE_BPS`).**
  Here a floor *is* warranted: NAV can tick between simulate and execution, and
  unwinding from the Blend strategy can round. **0.5% (50 bps) is fine — not too
  much.** It's a safety floor, not an expected loss: a stablecoin vault won't
  actually shed 0.5%, so it almost never binds; it just prevents a revert on normal
  drift. Expose `WITHDRAW_SLIPPAGE_BPS = 50` as a named constant.

## 9. Legacy Blend path — keep indefinitely

Do **not** remove `useBlendPosition`, `directBlendWithdraw`, or `getBlendUsdcBalance`:
- Migration detection needs the live Blend read.
- A legacy user who just wants their old Blend money out (no reinvest) must still be
  able to withdraw. Keep a "withdraw from Blend" affordance available whenever
  `blendBalance > 0`.
- Only the passive **deposit** entry point switches to the vault; Blend deposits are
  no longer initiated.

## 10. Edge cases & errors

- **No trustline / insufficient USDC** → same precheck as Blend deposit today.
- **Vault paused / cap reached** → surface a clear message; funds stay in wallet.
- **Blend withdraw fails (borrow / liquidity)** → §6 handling.
- **Deposit-step fails after Blend withdraw** → funds safe in wallet; retry re-enters
  at Step B (Blend balance already 0).
- **RPC blips on the balance read** → react-query retries; never render `$0`/undefined.
- **Double-click** → rely on the in-flight coalescing in `sorobanTx.ts`
  (`INFLIGHT_REQUESTS`).
- **Rounding** → shares rounded down on partial withdraw; withdraw-all reads live
  shares at execution.

## 11. Testing

- **Unit:** USDC↔shares conversion + rounding; `amounts_min` computation; migration
  state derivation (blendBalance>0 → Step A; ==0 → Step B).
- **Testnet manual (the real validation):**
  1. Fresh wallet → passive deposit → confirm vault `balance` and USDC value read
     back correctly; balance ticks with the live projection.
  2. Partial withdraw and withdraw-all → balances reconcile; no over-withdraw.
  3. Legacy path: seed a Blend supply, then run the invest flow → Step A withdraws
     Blend, Step B deposits combined amount to the vault.
  4. Interrupt after Step A (kill Step B) → re-enter → Step A auto-skips, Step B
     completes.
  5. Borrow-backed Blend → Step A blocked with the right message.

## 12. Rollout

- Behind a feature flag (env or config) so the passive deposit entry can switch
  Blend→vault without a code redeploy, and roll back fast.
- Deploy/confirm the dedicated vault + its config value first; verify a read
  (`balance`) returns before enabling deposits.

### Cutover runbook (issue 075)

The flag is `NEXT_PUBLIC_PASSIVE_VAULT_ENABLED` (build-time, dark by default —
only the literal `"true"` enables it). The Dockerfile ARG/ENV was wired in 070.

1. **Pre-cutover read gate** — run `node apps/web/tmp/2026-07-29-vault-precutover-check.mjs`
   pointed at the target vault/RPC. It must print **GREEN** (exercises `balance`,
   `get_asset_amounts_per_shares`, `total_supply`, `fetch_total_managed_funds`).
   ✅ Verified 2026-07-29 against the live mainnet vault
   `CB2U6PWS225PXWOAYGFIAWXYJBQHBWBQHEPC6NU2M257DKBRLBGMUPUZ` — all reads pass,
   including the 072 `fetch_total_managed_funds[0].total_amount` decode.
2. **Flip** — set `NEXT_PUBLIC_PASSIVE_VAULT_ENABLED=true` in the web app's build
   env (Dokploy → app-ui env vars, same place as `NEXT_PUBLIC_POSTHOG_KEY`)
   and rebuild. It's a `NEXT_PUBLIC_*` value, so it's baked at build time — a
   redeploy is required for the change to take effect.
3. **Verify live** — new passive deposits land in the vault (VaultBalanceRow shows
   the position; on-chain vault `balance(user)` grows); legacy Blend users see the
   migration prompt.
4. **Rollback** — unset the env (or set anything ≠ `"true"`) and rebuild; the
   `passiveDeposit`/`passiveWithdraw` routers fall straight back to direct-Blend.
   Legacy Blend read + withdraw stay functional regardless of the flag.

Pre-go-live TODO (tracked in slice notes): add es/pt translations for the
`migration.*` keys; run the §11 testnet checklist end-to-end.

## Resolved decisions

1. **Vault** — the Vaquita DeFindex vault, **shared with the locked pool**. Safe
   because df-tokens are per-holder (see Goal). Address = `usdc token.defindexVaultContractAddress`.
   No new config field.
2. **Interface** — confirmed against the deployed vault (SDK `22.0.6`), captured in
   §2. Single-asset USDC vault; the vault *is* the df-token (`balance`); USDC↔shares
   via `total_supply` + `fetch_total_managed_funds` and `get_asset_amounts_per_shares`.
3. **Slippage** — deposit `amounts_min` = desired (0, single-asset); withdraw floor
   **0.5% (50 bps)** — fine, a safety floor not an expected loss (§8).
4. **Migration is all-or-nothing** (§6): move the entire Blend balance to the vault,
   or withdraw it all to the wallet. No partial. Borrow-backed users are blocked
   until they repay.

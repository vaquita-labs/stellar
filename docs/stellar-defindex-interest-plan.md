# Stellar / DeFindex vault interest — implementation plan

Per-deposit interest should use **vault share NAV** (DeFindex) plus the **Vaquita reward pool** split, not Blend pool `bRate` or deposit-event fields that actually hold **vault shares**.

## Reference

- DeFindex: **`get_asset_amounts_per_shares(vault_shares)`** → underlying amounts for those shares now (read-only estimate).
- Vaquita pool: **`get_position(deposit_id)`** → `amount`, `shares`, `lock_period`; **`get_period_data(period)`** → `reward_pool`, `total_deposits`.
- Base analogue: **`previewRedeem(shares)`** on the Aave-backed vault (see `packages/shared/src/services/base/pool.ts`).

---

## Phase 1 — Soroban client + shared service (no Vaquita contract change)

- [x] Add `docs/stellar-defindex-interest-plan.md` (this file) and keep task checkboxes updated.
- [x] Add `packages/shared/src/services/stellar/defindexVault.ts`: simulate **`get_asset_amounts_per_shares`** on the vault contract; return asset amounts as `bigint[]` (index `0` = single-asset vault underlying).
- [x] Extend `packages/shared/src/services/stellar/stellar-sdk.ts`: simulate **`get_position`** on the Vaquita pool; parse `amount` / `shares` as `bigint`.
- [x] Refactor `packages/shared/src/services/stellar/blend.ts` **`getBlendInterest`**: resolve pool + vault addresses; **`blendInterest`** = `max(0, assets[0] - principal)` in token decimals; **Vaquita** = `reward_pool * principal / total_deposits` using **bigint** math and on-chain principal.
- [x] Update `packages/shared/src/services/deposit/index.ts`: stop requiring **`getBlendPoolReserve`** for Stellar per-deposit interest.
- [x] Optional **`TokenNetwork.defindex_vault_contract_address`**: support DB/env; document **`STELLAR_DEFINDEX_VAULT_CONTRACT`** fallback in `apps/api/.env.example`.
- [x] Export new modules from `packages/shared/src/services/stellar/index.ts`.
- [x] Run `@vaquita/shared` typecheck.

**Implemented (Phase 1):**

- `packages/shared/src/services/stellar/defindexVault.ts` — `getAssetAmountsPerShares`
- `packages/shared/src/services/stellar/stellar-sdk.ts` — `getVaquitaPoolPosition`, `getPeriodData` empty shape normalized to strings
- `packages/shared/src/services/stellar/blend.ts` — `getBlendInterest` uses vault + position (no Blend `bRate` / event XDR)
- `packages/shared/src/services/deposit/index.ts` — Stellar branch no longer loads `getBlendPoolReserve` for interest
- `packages/shared/src/services/stellar/index.ts` — re-export `defindexVault`
- `packages/shared/src/types/interfaces.ts` — optional `defindex_vault_contract_address` on `TokenNetwork`
- `apps/api/.env.example` — `STELLAR_DEFINDEX_VAULT_CONTRACT`

## Phase 2 — API + DTOs + UI copy

- [x] Rename or document response fields (`vaultInterest` vs `blendInterest`) for Stellar in API types / OpenAPI if any.
- [x] Adjust `getStellarApyData` so display APY is clearly separate from per-deposit **NAV** math (`interestModelNote` on API + UI). *(Deferred: spot APY from `fetch_total_managed_funds` + `total_supply`.)*

**Implemented (Phase 2):**

- `packages/shared/src/types/commons.ts`, `apps/web/src/core-ui/types/commons.ts` — `vaultInterest?`, JSDoc on `blendInterest`
- `packages/shared/src/services/deposit/index.ts` — Stellar deposits include `vaultInterest` (same numeric value as vault accrual; `blendInterest` retained)
- `packages/shared/src/services/base/aave.ts` — `StellarApyDisplayPayload`, `interestModelNote`, safer `getPeriodData` pool address via `firstElement`
- `apps/web` — `useApyByLockPeriod`, `useDeposit`, `useDepositsComplete`, `BankAPYModal` Stellar footnote for APY disclaimer

## Phase 4 — Tests and ops

- [ ] Integration: one testnet deposit vs withdraw `gross - principal` (rounding tolerance).
- [ ] Monitoring: simulation failures, vault paused / strategy errors → graceful “interest unavailable”.

## Phase 5 — Base alignment

- [ ] Replace linear Aave APY × time in **`getBaseInterest`** with **`previewRedeem(shares)` − principal`** using `positions(deposit_id_hex)` (mirror Stellar vault path).

---

## Configuration

| Source | Purpose |
|--------|---------|
| `STELLAR_DEFINDEX_VAULT_CONTRACT` | Vault contract id if not on `tokens_networks.defindex_vault_contract_address` |
| `tokenNetwork.defindex_vault_contract_address` (optional) | Per-network vault id from DB |

## Risks

- **Asset index**: `get_asset_amounts_per_shares` returns a `Vec`; index `0` must match the vault’s primary asset — verify with `get_assets()` if multi-asset.
- **Precision**: keep **`bigint`** until final human `number` for display.

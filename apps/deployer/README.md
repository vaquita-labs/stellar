# @vaquita/deployer

Creates a DeFindex vault via the [DeFindex REST API](https://api.defindex.io/docs),
signs the returned XDR locally with the Vaquita deployer key, submits it, and
writes the resulting vault contract address back to Doppler as `VAULT_ID`.

No Stellar CLI, no WASM build, no `stellar contract invoke`. Pure API + local
signing with `@stellar/stellar-sdk`.

## Flow

```
doppler run --config <env> -- pnpm deploy:vault
  │
  ├── 1. GET  /health                          (fail fast if API is down)
  ├── 2. POST /factory/create-vault            (returns unsigned XDR)
  ├── 3. sign XDR locally (DEPLOYER_SECRET_KEY never leaves this process)
  ├── 4. POST /send                            (returns txHash + returnValue)
  ├── 5. extract vault contract address from returnValue
  └── 6. doppler secrets set VAULT_ID=<addr>   (overwrites previous value)
```

## Install

```bash
cd apps/deployer
pnpm install
```

## Configure (Doppler)

Set all variables listed in `.env.example` under the `defindex-vault` project,
one config per environment (`testnet`, `mainnet`). Separate keypairs per env —
never share.

## Run

```bash
# Testnet
doppler run --project defindex-vault --config testnet -- pnpm deploy:vault

# Mainnet
doppler run --project defindex-vault --config mainnet -- pnpm deploy:vault
```

On success, the new vault address is printed and written back to the same
Doppler config as `VAULT_ID`.

## Role mapping

The DeFindex factory takes a `roles` map keyed by integer. This script wires
them as follows (matching the on-chain storage keys seen in vault metadata):

| Key | Role               | Env var                      |
| --- | ------------------ | ---------------------------- |
| 0   | EmergencyManager   | `EMERGENCY_MANAGER_ADDRESS`  |
| 1   | VaultFeeReceiver   | `VAULT_FEE_RECEIVER_ADDRESS` |
| 2   | Manager            | `MANAGER_ADDRESS`            |
| 3   | RebalanceManager   | `REBALANCE_MANAGER_ADDRESS`  |

## Safety notes

- `DEPLOYER_SECRET_KEY` is only read into memory for `tx.sign(...)` and is
  never logged or sent over the network.
- The script refuses to run if `NETWORK` is `mainnet` but Doppler doesn't
  report the current config as `mainnet` — prevents cross-env key leaks.
- Idempotency is NOT guaranteed: each run creates a fresh vault. The previous
  `VAULT_ID` is overwritten, not deleted on-chain.

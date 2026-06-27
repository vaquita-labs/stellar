# @vaquita/deployer

Creates a DeFindex vault via the [DeFindex REST API](https://api.defindex.io/docs),
signs the returned XDR locally with the Vaquita deployer key, submits it, and
can write the resulting vault contract address back to Doppler as `VAULT_ID`.

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
  └── 6. optional Doppler VAULT_ID writeback
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

## GitHub Actions guarded mode

The mainnet workflow uses GitHub Environment secrets and variables as the
primary CI source. It sets:

```bash
DEPLOYMENT_ENVIRONMENT=<selected GitHub Environment>
DEPLOYMENT_ARTIFACT_PATH=artifacts/defindex-vault-<env>.json
WRITE_VAULT_ID_TO_DOPPLER=false
```

Run validation only:

```bash
DEPLOYER_VALIDATE_ONLY=true pnpm deploy:vault
```

Run the irreversible vault creation:

```bash
DEPLOYER_VALIDATE_ONLY=false pnpm deploy:vault
```

Validation mode checks config, key/public-key matching, and environment/network
guards without calling the DeFindex API. Execute mode calls the existing API
flow, signs locally, submits, and writes a JSON artifact containing the public
deployment inputs, vault ID, transaction hash, explorer links, and
`manual_rewire_required=true`.

## DeFindex request mapping

The DeFindex factory takes named role fields and top-level vault metadata. This
script wires them as follows:

| Request field                    | Env var                       |
| -------------------------------- | ----------------------------- |
| `roles.emergencyManager`         | `EMERGENCY_MANAGER_ADDRESS`   |
| `roles.feeReceiver`              | `VAULT_FEE_RECEIVER_ADDRESS`  |
| `roles.manager`                  | `MANAGER_ADDRESS`             |
| `roles.rebalanceManager`         | `REBALANCE_MANAGER_ADDRESS`   |
| `vaultFeeBps`                    | `VAULT_FEE_BPS`               |
| `name`                           | `VAULT_NAME`                  |
| `symbol`                         | `VAULT_SYMBOL`                |
| `assets[0].address`              | `USDC_CONTRACT_ADDRESS`       |
| `assets[0].strategies[0].address`| `BLEND_USDC_STRATEGY_ADDRESS` |
| `assets[0].strategies[0].name`   | `BLEND_USDC_STRATEGY_NAME`    |
| `caller`                         | `DEPLOYER_PUBLIC_KEY`         |

## Safety notes

- `DEPLOYER_SECRET_KEY` is only read into memory for `tx.sign(...)` and is
  never logged or sent over the network.
- The script refuses to run if `NETWORK` is `mainnet` but the selected GitHub
  Environment is not `mainnet`, `prod`, or `production`. For local Doppler runs
  without a GitHub Environment, `DOPPLER_CONFIG=mainnet` is still required.
- The script refuses to run `NETWORK=testnet` under a mainnet/prod selected
  environment.
- GitHub Actions sets `WRITE_VAULT_ID_TO_DOPPLER=false`; CI does not require a
  Doppler token and does not update runtime app config.
- Idempotency is NOT guaranteed: each run creates a fresh vault. The previous
  `VAULT_ID` is overwritten only when Doppler writeback is enabled locally.

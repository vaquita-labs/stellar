# VaquitaPool Upgrade Runbook

This document describes how to safely upgrade the `VaquitaPool` Soroban contract using the 48-hour timelock mechanism introduced in the `upgrade` module.

## Prerequisites

- Admin keypair with `Owner` authority over the deployed contract
- Stellar CLI (`stellar` ≥ 22) installed and configured
- `SOURCE_ACCOUNT` env var set to the admin keypair secret or an alias
- `NETWORK` env var set (`testnet` or `mainnet`)
- Compiled WASM ready at `contracts/target/wasm32v1-none/release/vaquita_pool.wasm`

---

## 1. Build the new WASM

```bash
cd contracts
make build
# Output: contracts/target/wasm32v1-none/release/vaquita_pool.wasm
```

---

## 2. Upload the WASM and get the hash

```bash
stellar contract upload \
  --wasm contracts/target/wasm32v1-none/release/vaquita_pool.wasm \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK"
# Prints the 64-character hex WASM hash — save it as $NEW_WASM_HASH
```

---

## 3. Propose the upgrade

Call `propose_upgrade(new_wasm_hash)` from the admin account. The contract stores the hash and records `ready_at = now + 48 hours`. No state is changed yet.

```bash
stellar contract invoke \
  --id "$VAQUITA_POOL_CONTRACT_ID" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- propose_upgrade \
  --new_wasm_hash "$NEW_WASM_HASH"
```

Confirm it was recorded:

```bash
stellar contract invoke \
  --id "$VAQUITA_POOL_CONTRACT_ID" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- version
# Should still print the current version number
```

---

## 4. Wait 48 hours (timelock)

The upgrade cannot be executed before `ready_at`. Attempting to call `execute_upgrade` early returns `UpgradeNotReady (21)`.

You may cancel the proposal at any point during this window if the upgrade needs to be aborted (see §6).

---

## 5. Execute the upgrade

After the timelock elapses, run:

```bash
stellar contract invoke \
  --id "$VAQUITA_POOL_CONTRACT_ID" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- execute_upgrade
```

This atomically:
1. Validates the pending hash and timelock.
2. Replaces the contract WASM on-chain.
3. Increments the on-chain `version` counter.
4. Emits an `UpgradeExecuted` event.

Confirm the version bumped:

```bash
stellar contract invoke \
  --id "$VAQUITA_POOL_CONTRACT_ID" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- version
# Should be previous_version + 1
```

---

## 6. Cancel an in-flight proposal (if needed)

Call `cancel_upgrade` at any time before `execute_upgrade`:

```bash
stellar contract invoke \
  --id "$VAQUITA_POOL_CONTRACT_ID" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- cancel_upgrade
```

---

## 7. Post-upgrade smoke tests

Run these checks immediately after a successful execute:

| Check | Command |
|-------|---------|
| Contract responds | `stellar contract invoke ... -- version` |
| Not paused | `stellar contract invoke ... -- is_paused` → `false` |
| Solvency invariant holds | `stellar contract invoke ... -- check_solvency` → no error |
| Deposit still works | Attempt a small test deposit on testnet |
| Withdraw still works | Attempt a withdrawal on testnet |

---

## 8. Emergency: lock upgrades forever

If upgrades must be permanently disabled (e.g., after reaching a fully ossified protocol state), call `lock_upgrades_forever`. **This is irreversible.**

```bash
stellar contract invoke \
  --id "$VAQUITA_POOL_CONTRACT_ID" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- lock_upgrades_forever
```

After this, both `propose_upgrade` and `execute_upgrade` return `UpgradeLocked (22)`.

---

## Error codes reference

| Code | Name | Meaning |
|------|------|---------|
| 20 | `UpgradeNotProposed` | `execute_upgrade` or `cancel_upgrade` called with no pending proposal |
| 21 | `UpgradeNotReady` | Timelock has not elapsed yet |
| 22 | `UpgradeLocked` | `lock_upgrades_forever` was called; no further upgrades possible |

---

## Env vars used by Makefile

```
SOURCE_ACCOUNT   admin keypair secret or alias
NETWORK          testnet | mainnet
VAQUITA_POOL_CONTRACT_ID   deployed contract address
```

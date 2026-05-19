# Admin Key Rotation Runbook

## When to rotate

Rotate the badge signing key when **either** condition is met:

- TVL exceeds **$10k** on Stellar mainnet
- **First full monthly cycle** closes on Stellar mainnet

Both conditions require **CTO + one additional signer** to approve and execute.

---

## Who can execute

The `update_signing_key` function is gated to the admin address stored in the contract.
Execution requires two people to be present:

1. **CTO** — holds or unlocks the admin secret key
2. **One additional signer** — second pair of eyes, cross-checks the new key bytes before broadcast

Neither party should proceed without the other present.

---

## Rotation steps

### 1. Generate a new Ed25519 keypair

```bash
stellar keys generate badge-signing-key-v2 --network mainnet
```

### 2. Export the raw 32-byte public key

Using the Stellar CLI:
```bash
stellar keys show badge-signing-key-v2 --raw
```

Or using the TypeScript helper in `packages/shared`:
```ts
import { getBadgeSigningPublicKey } from '@vaquita/shared';
console.log(getBadgeSigningPublicKey());  // hex-encoded 32-byte public key
```

Both methods output the same 32-byte hex string. **Both signers must verify the hex matches before proceeding.**

### 3. Call `update_signing_key` on-chain

```bash
stellar contract invoke \
  --id <BADGE_CONTRACT_ID> \
  --source <ADMIN_SECRET_KEY> \
  --network mainnet \
  -- update_signing_key \
  --caller <ADMIN_ADDRESS> \
  --new_key <NEW_PUBLIC_KEY_HEX>
```

`BADGE_CONTRACT_ID` is stored in the `networks.badges_contract_address` database column (not an env var).

### 4. Update backend secrets

Update `BADGE_SIGNING_SEED` in the backend secrets manager (e.g. AWS Secrets Manager, Vault) to the new 64-char hex seed corresponding to the new keypair.

### 5. Restart the API service

```bash
# Example — adjust for your deployment platform
kubectl rollout restart deployment/api
```

### 6. Verify

Call the claim endpoint with a known-eligible test wallet:

```bash
curl "https://api.vaquita.fi/api/v1/claim/Stellar?type=beta_tester&wallet=<TEST_WALLET>"
```

Confirm the returned `signature` verifies against the new public key. The API logs will also show `Issued new badge claim` with no signing errors.

---

## Pre-mainnet multisig migration

Before mainnet launch, migrate the admin address from a single EOA to a **2-of-3 Stellar multisig account**:

1. Create three separate Stellar keypairs for the multisig signers (CTO, COO, external auditor).
2. Fund a new Stellar account that will become the multisig admin.
3. Set the account's thresholds: `low = 2, medium = 2, high = 2` and add the three keypairs as signers with weight 1.
4. Call `update_signing_key` from the *current* single-key admin to transfer to the new multisig account as the caller address. (This step may require a separate admin migration function if the contract admin itself needs updating — confirm with the contract team.)
5. Verify the multisig account can successfully call `update_signing_key` by executing a test rotation on testnet with two of the three signers.

**Rotation of the multisig itself** (changing the signer set) requires approval from CTO + one additional signer and follows the same two-person rule as above.

---

## Security notes

- Never store the active `BADGE_SIGNING_SEED` in source control or unencrypted config.
- After rotation, revoke or archive the old seed from the secrets manager.
- Keep rotation records (date, who executed, old key fingerprint, new key fingerprint) in the internal audit log.

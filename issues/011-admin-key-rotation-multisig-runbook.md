## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

This is a **HITL** slice covering two related operational concerns:

1. **`update_signing_key` in the contract** — verify the function exists and is
   callable only by the admin, write an integration test that rotates the key and
   confirms old signatures are rejected while new ones are accepted.

2. **Pre-mainnet multisig migration runbook** — document the concrete steps to migrate
   from a single `.env` key to a 2-of-3 multisig before mainnet launch. Migration
   triggers: TVL > $10k OR first full monthly cycle closes on mainnet (whichever
   comes first). Rotation restricted to CTO + one additional signer.

See FAQ §Admin Key Custody and §10.2 (Operational Decisions — Admin key custody) of
the whitepaper.

## Acceptance criteria

- [ ] `update_signing_key(new_key)` exists in the contract and is admin-only
- [ ] Integration test: rotate key → old signed claim rejected → new signed claim accepted
- [ ] Runbook document covers: how to generate the new multisig keypair, how to call `update_signing_key`, how to update the backend signing service, and how to verify the rotation succeeded on-chain
- [ ] Runbook specifies the two migration triggers and who has authority to execute
- [ ] Runbook reviewed and signed off by CTO before mainnet deploy

## Blocked by

- Blocked by `issues/001-contract-core-mint-badge-soulbound.md`

## User stories addressed

- Protocol can respond to a signing key compromise without contract redeployment
- Mainnet operations meet the security bar of 2-of-3 multisig approval for key changes

## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

Integrate Privy + Pollar fee bumping so users never need to hold XLM to claim a badge.
The flow: user signs the inner `mint_badge` transaction via their wallet; the fee bump
service wraps it in a fee bump transaction funded from the protocol XLM account and
submits to the network.

This is a **HITL** slice — implementation owner is **Oscar Gauss**. Requires coordination
with the Privy and Pollar integration already present in the codebase
(`fix(stellar): pass Pollar key to Docker build and harden disconnect`).

See FAQ §Fee Bumping and §10.3 (Operational Decisions — Fee bumping) of the whitepaper.

## Acceptance criteria

- [ ] User can submit a `mint_badge` transaction without holding XLM
- [ ] Fee bump wrapper is integrated with Privy wallet signing flow
- [ ] Protocol XLM account sponsors the fee; amount is logged per transaction
- [ ] Fee bump service handles submission failures gracefully (retry or surface error to user)
- [ ] Tested end-to-end on testnet: wallet with 0 XLM successfully claims a badge

## Blocked by

- Blocked by `issues/002-backend-claim-signer-api-cat-c.md`

## User stories addressed

- Users without XLM can claim badges without friction
- Protocol abstracts gas costs entirely from the badge claim UX

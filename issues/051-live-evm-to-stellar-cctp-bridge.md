## Parent PRD

`docs/cctp-bidirectional-bridge-prd.md`

## What to build

Complete the live EVM to Stellar bridge path from the existing issue 050 foundation. A user should be able to start from the Wallet page, connect an injected EVM wallet on Base or Ethereum, approve USDC only when needed, burn through raw CCTP V2, resume while Circle attestation is pending, and have Vaquita relay the permissionless Stellar destination `mint_and_forward` step after Circle attestation is ready.

This slice replaces the current manual source/destination transaction hash flow for EVM to Stellar with in-app source transaction building, signing, submission, backend/worker relayed destination completion, tracking, and resume behavior. Bridged funds still land in the user's Stellar wallet; this slice must not auto-deposit into VaquitaPool.

## Acceptance criteria

- [x] EVM to Stellar transfers build raw CCTP V2 source transactions for Base and Ethereum without using Circle Bridge Kit.
- [x] The UI checks ERC-20 allowance and asks for approval only when the selected USDC allowance is insufficient.
- [x] The UI warns about EVM gas, Stellar fees, CCTP finality delay, source wallet, destination wallet, and destination chain before signing.
- [x] The signed EVM source transaction hash and available message metadata are attached to the persisted bridge transfer idempotently.
- [x] Pending transfers can be resumed from the Wallet page after refresh or browser close.
- [x] When Circle attestation is ready, the backend/worker relays the Stellar `CctpForwarder.mint_and_forward` destination transaction without requiring a second user wallet prompt.
- [x] The UI shows relayer progress for destination completion and offers a clear recoverable state if relay submission fails.
- [x] Destination transaction submission is attached idempotently and the transfer reaches a completed state after confirmation.
- [x] Amount conversion uses integer CCTP amounts and preserves the EVM/Stellar decimal boundary.
- [x] Unsupported EVM chains, invalid EVM addresses, invalid Stellar addresses, and wallet/network mismatches fail before signing.
- [x] The Deposit modal helper still opens the bridge flow without changing the VaquitaPool deposit path.
- [x] Tests cover approval-needed and approval-not-needed flows, source burn submission, interrupted transfer resume, ready-to-complete state, relayed destination completion, relay failure/retry, and invalid wallet/network cases.
- [x] Handoff includes testnet smoke steps for Base Sepolia or Ethereum Sepolia to Stellar testnet.

## Implementation note

- Added shared CCTP EVM transaction builders for ERC-20 allowance, ERC-20 approval, and raw `depositForBurnWithHook` calls to Stellar `CctpForwarder`.
- Added official Circle CCTP V2 EVM contract configuration and Stellar `CctpForwarder` addresses for supported Base/Ethereum and testnet/mainnet networks.
- Added Wallet page live source burn action for EVM to Stellar transfers.
- Replaced browser-side Stellar/Pollar `mint_and_forward` with relayer-first backend/worker completion.
- Added server-only Stellar relayer env config for destination `mint_and_forward`.
- Added manual validation suite under `issues/test/suite/051-live-evm-to-stellar-cctp-bridge.md`.
- Browser wallet prompt branches remain validated through the manual HITL suite because injected EVM wallets and live CCTP testnet burns cannot be fully automated in local unit tests.

## Blocked by

- Blocked by `issues/done/050-bidirectional-cctp-usdc-bridge.md`

## User stories addressed

- User story 1
- User story 2
- User story 7
- User story 8
- User story 9
- User story 10
- User story 11
- User story 12
- User story 13
- User story 14
- User story 15
- User story 16
- User story 17
- User story 18
- User story 19
- User story 20
- User story 21
- User story 22
- User story 23
- User story 26
- User story 28
- User story 29
- User story 42
- User story 43
- User story 44
- User story 45
- User story 46
- User story 47
- User story 48
- User story 49
- User story 50
- User story 55
- User story 56
- User story 57

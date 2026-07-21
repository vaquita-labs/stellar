## Parent PRD

`docs/cctp-bidirectional-bridge-prd.md`

## What to build

Add a bidirectional USDC bridge experience using raw CCTP V2 for EVM to Stellar and Stellar to EVM. The first supported EVM networks are Base and Ethereum, with Base Sepolia and Ethereum Sepolia used for testnet validation before mainnet activation.

This issue creates the product, API, database, and worker foundation for CCTP bridging. It is not a VaquitaPool deposit automation issue: bridged funds land in the user's wallet, and the user explicitly starts a normal Vaquita deposit afterward.

## Product scope

- Add a "Bridge USDC" flow on the Wallet page.
- Add a helper link in the Deposit modal for users who need Stellar USDC before saving.
- Support EVM to Stellar and Stellar to EVM directions.
- Support Base and Ethereum on the EVM side.
- Use injected EVM wallets for MVP.
- Continue using the existing Stellar/Pollar wallet path for Stellar signing.
- Track bridge attempts so users can resume after browser close, refresh, or attestation delay.
- Show pending, ready-to-complete, completed, failed, cancelled, and needs-review states.

## Technical scope

- Add CCTP bridge configuration for supported testnet and mainnet chains.
- Add a shared CCTP module for:
  - supported chain/domain lookup,
  - CCTP contract/address config,
  - address validation,
  - amount conversion,
  - attestation/message metadata normalization,
  - explorer URL generation,
  - status normalization.
- Add a bridge transfer database model and migration.
- Add bridge API endpoints to:
  - create a transfer,
  - attach source transaction metadata,
  - refresh status,
  - attach destination transaction metadata,
  - list active transfers for a wallet,
  - recover/import a known source transaction when practical.
- Add frontend bridge components and hooks for Wallet page and Deposit modal helper entry.
- Add bounded bridge confirmation processing. This must process only known Vaquita transfer rows and must not become a continuous blockchain event listener.
- Add one Dokploy deployable worker process for bridge confirmations, or an equivalent command that can be deployed as a separate worker process.
- Update Dokploy/runbook documentation with bridge worker config, polling limits, required environment variables, and mainnet activation guardrails.

## Bridge confirmation design

Use a transfer-state tracker, not a global event listener.

1. User starts a bridge transfer in Vaquita.
2. API creates a bridge transfer row with source/destination wallets, direction, chain config, amount, and initial status.
3. User signs the source-chain step.
4. Client submits the source transaction hash and message metadata to the API.
5. API or worker confirms only that specific source transaction/message.
6. API or worker polls Circle attestation for that transfer only.
7. When attestation is ready, the transfer becomes ready to complete.
8. User signs the destination-chain completion step.
9. Client submits destination transaction hash to the API.
10. API or worker confirms only that destination transaction and marks the transfer completed.

The worker should:

- process bounded batches of non-terminal rows,
- use row locks or leases so multiple worker instances do not race,
- skip terminal transfers,
- move old or repeatedly failing transfers to needs review,
- expose enough logs/metrics for operations,
- never scan all chain events,
- never run one poller per user or per transfer.

## Acceptance criteria

- [x] Wallet page exposes a Bridge USDC flow.
- [x] Deposit modal includes a helper link to bridge USDC before depositing.
- [x] Bridge tracker supports EVM to Stellar transfer records.
- [x] Bridge tracker supports Stellar to EVM transfer records.
- [x] EVM side supports Base and Ethereum through config.
- [x] Testnet config supports Base Sepolia, Ethereum Sepolia, and Stellar testnet.
- [x] MVP EVM wallet support uses injected wallets for wallet connection and balance checks.
- [x] Stellar signing remains outside this tracker foundation and continues through the existing Stellar/Pollar wallet path in follow-up live transaction slices.
- [x] Bridge foundation uses raw CCTP V2 configuration/helpers and does not depend on Circle Bridge Kit.
- [x] Bridge transfers are persisted in the database with typed statuses and step metadata.
- [x] API endpoints are idempotent for repeated source/destination tx submissions.
- [x] Users can resume a pending transfer from the Wallet page after page refresh or browser close.
- [x] UI shows source tx, attestation waiting, ready-to-complete, destination tx, completed, failed, and needs-review states.
- [x] Lazy refresh and manual refresh are available in the UI.
- [x] Bridge confirmation worker processes only known transfer rows.
- [x] Worker uses bounded batches and a lease/lock pattern.
- [x] Worker does not implement global chain event listening.
- [x] Stale transfer policy is configurable and documented.
- [x] CCTP amount conversion uses integer math and covers EVM/Stellar decimal differences.
- [x] Unsupported chains, invalid addresses, and direction/network mismatches fail before signing.
- [x] Mainnet bridge is feature-flagged or config-gated until testnet smoke tests pass.
- [x] Dokploy documentation includes the bridge worker process and required environment variables.
- [x] Handoff includes manual validation steps for both bridge directions; real live smoke is split into `issues/054-cctp-testnet-smoke-and-mainnet-activation-gate.md`.

## Testing expectations

- [x] Shared CCTP module tests cover chain/domain lookup, unsupported chains, address validation, explorer URLs, and amount conversion.
- [x] API/service tests cover create, attach source tx, refresh, attach destination tx, list active transfers, idempotent retries, invalid payloads, and terminal-state immutability.
- [x] Worker tests cover bounded batch processing, leases, stale rows, mocked Circle attestation responses, and empty queue behavior.
- [x] Manual validation suite covers direction selection, chain selection, missing injected wallet state, pending transfer resume, ready-to-complete state, and the Deposit modal helper link.

## Implementation note

Tracer-bullet implementation is in place:

- Added shared CCTP config/helpers for Base, Ethereum, Stellar, Stellar forwarder hook data, address validation, and six-decimal CCTP amount conversion.
- Added bridge transfer service, Prisma-backed repository, SQL migration, API routes, Circle Iris attestation adapter, and bounded confirmation worker command.
- Added Wallet page Bridge USDC modal and Deposit modal helper link.
- Added manual validation suite under `issues/test/suite/050-bidirectional-cctp-usdc-bridge.md`.
- Updated Dokploy docs with the bridge confirmation worker.

Completion note:

- Issue 050 is the bidirectional bridge tracker foundation. It creates the resumable product/API/database/worker path and manual validation suite.
- Live client-side source burn and destination completion transaction builders/signing were split into `issues/051-live-evm-to-stellar-cctp-bridge.md` and `issues/052-live-stellar-to-evm-cctp-bridge.md`.
- Recovery/metrics hardening beyond the foundation was split into `issues/053-bridge-recovery-metrics-and-worker-guardrails.md`.
- Real testnet smoke and mainnet activation remain gated in `issues/054-cctp-testnet-smoke-and-mainnet-activation-gate.md`.

## Blocked by

None for implementation planning. Mainnet activation is blocked by successful testnet CCTP smoke tests and current official Circle CCTP V2 configuration review.

## User stories addressed

- User story 1
- User story 2
- User story 3
- User story 4
- User story 5
- User story 6
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
- User story 24
- User story 25
- User story 26
- User story 27
- User story 28
- User story 29
- User story 30
- User story 31
- User story 32
- User story 33
- User story 34
- User story 35
- User story 36
- User story 37
- User story 38
- User story 39
- User story 40
- User story 41
- User story 42
- User story 43
- User story 44
- User story 45
- User story 46
- User story 47
- User story 48
- User story 49
- User story 50
- User story 51
- User story 52
- User story 53
- User story 54
- User story 55
- User story 56
- User story 57

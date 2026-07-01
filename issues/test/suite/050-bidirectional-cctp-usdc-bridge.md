## Purpose

Validate the bidirectional CCTP USDC bridge foundation for issue 050: Wallet-page bridge UI, Deposit-modal helper link, bridge transfer API persistence, Circle attestation refresh, and the bounded bridge-confirmation worker.

## Prerequisites

- Local dependencies installed with pnpm.
- Database migrated with `apps/supabase/migrations/20260629_bridge_transfers.sql`.
- Prisma client regenerated with `pnpm --filter @vaquita/db generate`.
- API has `DATABASE_URL` configured.
- Web has `NEXT_PUBLIC_SERVICES_URL` pointing at the API.
- For live CCTP attestation checks, `CIRCLE_CCTP_IRIS_BASE_URL` may be set. If omitted, the API uses Circle Iris sandbox for testnet source networks and production Iris for mainnet source networks.
- Worker stale policy is controlled by `BRIDGE_CONFIRMATION_STALE_AFTER_MS`.
- Worker lease duration is controlled by `BRIDGE_CONFIRMATION_LEASE_MS`.

## Safety And HITL Guardrails

- Run UI/API validation on local or staging first.
- Do not use mainnet CCTP until testnet EVM to Stellar and Stellar to EVM smoke checks have passed.
- The bridge tracker must not sign transactions server-side and must not store private keys.
- The bridge-confirmation worker must process only `bridge_transfers` rows created/imported by Vaquita. It must not scan all Base, Ethereum, or Stellar events.
- Use tiny testnet USDC amounts for live smoke checks.

## Setup

1. Start the API with `pnpm dev:api`.
2. Start the web app with `pnpm dev:app`.
3. Open the web app and connect the normal Stellar/Pollar wallet.
4. Open `/profile/wallet`.
5. Confirm the page shows the existing Receive, Send, and Balance actions.

## Scenario 1: Wallet Page Bridge Entry

1. Click `Bridge USDC`.
2. Confirm the modal opens.
3. Select `EVM -> Stellar`.
4. Confirm `Ethereum Sepolia` is selected by default.
5. Click `Connect` with an injected EVM wallet available.
6. Confirm the modal shows the selected EVM wallet's Ethereum Sepolia USDC balance.
7. Enter a small amount such as `0.1`.
8. Click `Create resumable transfer`.

Expected result:

- A bridge transfer row is created.
- The modal lists the transfer under Active transfers.
- The status is `Waiting for source transaction`.
- The destination wallet is the connected Stellar wallet.
- If the wallet is on the wrong EVM chain, the modal asks the user to switch networks instead of showing a stale balance.
- If the amount exceeds the EVM USDC balance, the create button is disabled and an insufficient-balance message appears.

## Scenario 2: Deposit Modal Helper Link

1. Open the main Deposit modal.
2. Click `Need Stellar USDC? Bridge from Base or Ethereum`.

Expected result:

- The Deposit modal closes.
- The app navigates to `/profile/wallet?bridge=1`.
- The Bridge USDC modal opens automatically.

## Scenario 3: Source Transaction Tracking

1. Select a created bridge transfer.
2. Paste a test source transaction hash in `Source transaction hash`.
3. Click `Attach source tx`.

Expected result:

- The transfer status changes to `Waiting for Circle attestation`.
- Repeating the same attach action does not create a duplicate row.
- Attaching the same source hash to another transfer fails.

## Scenario 4: Attestation Refresh

1. Select a transfer with a real CCTP source transaction hash, or configure a staging API response/mock for Circle Iris.
2. Click `Refresh attestation`.

Expected result:

- If Circle has not attested yet, the transfer remains pending.
- If Circle returns a complete message, the transfer changes to `Ready to complete`.
- If Circle returns an error or malformed complete response, the transfer becomes `Needs review`.

## Scenario 5: Destination Completion Tracking

1. Select a `Ready to complete` transfer.
2. Paste a destination transaction hash.
3. Click `Mark destination complete`.

Expected result:

- The transfer is marked completed by the API.
- It no longer appears in the active transfer list after refresh.

## Scenario 6: Bridge Confirmation Worker

1. Ensure at least one row is in `attestation_pending`.
2. Run `pnpm --filter @vaquita/api bridge-confirmation:once`.
3. Check API logs.

Expected result:

- The worker logs a single batch summary.
- It claims at most `BRIDGE_CONFIRMATION_BATCH_SIZE` rows.
- It clears leases after saving.
- It does not process terminal rows.
- It does not scan chain events globally.

## Scenario 7: Stale Transfer Guardrail

1. Set `BRIDGE_CONFIRMATION_STALE_AFTER_MS` to a small value such as `1`.
2. Ensure an old `attestation_pending` row exists, or update a local test row's `updated_at` to an old timestamp.
3. Run `pnpm --filter @vaquita/api bridge-confirmation:once`.

Expected result:

- The stale row moves to `needs_review`.
- The row has an error or review reason indicating it exceeded the stale threshold.
- The worker summary includes a stale count.
- The worker does not keep polling that row indefinitely.

## Artifact And Log Checks

- API logs show bridge route requests without private keys or signing material.
- Worker logs show only aggregate batch counts and transfer state transitions.
- Database rows contain source/destination wallets, amount, status, tx hashes, and attestation fields when available.
- Stale rows contain a support-readable `error_reason`.
- No secrets are logged.

## Rollback Or Pause Notes

- Disable the bridge UI with config/feature gating before mainnet activation if testnet smoke fails.
- Stop the `bridge-confirmation` worker independently from the API if Circle Iris or RPC providers are degraded.
- Existing transfers remain recoverable through lazy/manual Wallet page refresh when the worker is paused.

## Pass Criteria

- Wallet page bridge flow creates and lists a persisted transfer.
- Deposit modal helper opens the bridge flow.
- Source tx attach is idempotent.
- Attestation refresh transitions pending transfers correctly.
- Destination tx attach completes ready transfers.
- Bridge worker processes only bounded known transfer rows.
- Stale transfer policy is configurable and moves old pending rows to needs review.
- No server-side custody or private-key handling is introduced.

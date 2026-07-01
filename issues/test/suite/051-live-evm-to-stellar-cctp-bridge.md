## Purpose

Validate the live EVM to Stellar CCTP bridge path for issue 051: injected EVM wallet approval checks, live CCTP source burn, persisted source transaction tracking, Circle attestation refresh, and backend/worker relayed Stellar destination completion through `CctpForwarder.mint_and_forward`.

## Prerequisites

- Local dependencies installed with `pnpm install`.
- API database has the bridge transfer migration from issue 050.
- API has `DATABASE_URL` configured.
- API has `CIRCLE_CCTP_IRIS_BASE_URL` empty or pointed at Circle Iris sandbox for testnet validation.
- API worker has `BRIDGE_STELLAR_RELAYER_SECRET` set to a funded Stellar testnet account.
- Web has `NEXT_PUBLIC_SERVICES_URL` pointed at the API.
- Browser has an injected EVM wallet connected to Ethereum Sepolia or Base Sepolia.
- The selected EVM wallet has testnet ETH gas and testnet USDC.
- The Vaquita relay account is funded with enough Stellar testnet XLM to submit the destination `mint_and_forward` transaction.
- Use tiny testnet amounts only, such as `0.1` USDC.
- New EVM burns should encode Circle CCTP V2 fast finality threshold `1000`, so Iris can attest after confirmed finality instead of waiting for finalized threshold `2000`.

## Safety And HITL Guardrails

- Do not use mainnet for this suite.
- Confirm the bridge modal shows Ethereum Sepolia or Base Sepolia, not mainnet Ethereum/Base.
- Confirm the destination wallet is the connected Stellar wallet before signing.
- The API and worker must not store user private keys, EVM signatures, Stellar auth entries, or wallet secrets.
- The relay signing key, if configured, must be server-only and never exposed to the browser.
- If a wallet prompt shows an unexpected spender, chain, amount, or destination, reject it and stop.

## Setup

1. Start the API with `pnpm dev:api`.
2. Start the web app with `pnpm dev:app`.
3. Open `/profile/wallet`.
4. Connect the Stellar/Pollar wallet.
5. Open `Bridge USDC`.
6. Connect the injected EVM wallet.
7. Select `EVM -> Stellar`.
8. Select `Ethereum Sepolia` unless intentionally testing Base Sepolia.

## Scenario 1: Create A Live EVM To Stellar Transfer

1. Confirm the modal displays the selected EVM wallet and connected Stellar destination wallet.
2. Confirm the modal displays the EVM USDC balance or asks to switch to the selected EVM network.
3. Enter a tiny amount.
4. Click `Approve and burn source USDC`.

Expected result:

- A transfer is persisted and listed under Active transfers.
- Source network is the selected EVM testnet.
- Destination network is Stellar testnet.
- Source and destination wallets cannot be edited for that persisted transfer.
- The UI immediately proceeds into the approval/burn source flow.

## Scenario 2: Approval And Source Burn

1. If the wallet asks for USDC approval, confirm the spender is Circle `TokenMessengerV2` for the selected testnet and the amount is expected.
2. Confirm the CCTP burn transaction in the injected EVM wallet.

Expected result:

- If allowance was insufficient, exactly one approval prompt appears before the burn prompt.
- If allowance was already sufficient, no approval prompt appears.
- The burn transaction is sent to Circle `TokenMessengerV2`.
- The burn calldata encodes `minFinalityThreshold = 1000`.
- The API attaches the burn transaction hash to the transfer.
- The transfer moves to `Waiting for Circle attestation`.
- Re-running source attach with the same hash is idempotent.

## Scenario 3: Attestation Refresh

1. Wait until the EVM burn transaction is confirmed.
2. Click `Refresh attestation`, or run `pnpm --filter @vaquita/api bridge-confirmation:once`.
3. Repeat after a short wait if Circle is still pending.

Expected result:

- While Circle Iris is pending, the transfer remains `Waiting for Circle attestation`.
- Once Circle returns a complete message, the transfer moves to `Ready to complete`.
- The database row contains `cctp_message` and `cctp_attestation`.

## Scenario 4: Relayed Stellar Destination Completion

1. Select the `Ready to complete` transfer.
2. Trigger destination completion from the UI or run the bridge confirmation worker if relay is worker-driven.
3. Wait for the relayer to submit the Stellar transaction.

Expected result:

- No Stellar/Pollar user wallet prompt appears.
- The relayed Stellar transaction invokes the configured Stellar testnet `CctpForwarder`.
- The transfer's destination transaction hash is attached to the API.
- The transfer reaches `Completed`.
- The transfer no longer appears in the active transfer list after refresh.
- The Stellar destination wallet receives the bridged USDC amount, accounting for Stellar's seven-decimal display precision.

## Scenario 5: Recovery After Browser Refresh

1. Create a transfer and complete the source burn.
2. Refresh the browser while the transfer is waiting for Circle attestation.
3. Reopen `/profile/wallet`.
4. Open `Bridge USDC`.

Expected result:

- The pending transfer appears under Active transfers.
- Manual refresh can advance it when attestation is ready.
- The UI shows relay progress once the transfer is ready.

## Artifact And Log Checks

- API logs show bridge route calls without private keys or signing material.
- Worker logs show bounded batch summaries only.
- Worker environment contains the relayer secret only on the server-side API/worker process.
- Database row includes source/destination wallets, amount, source tx hash, CCTP message, CCTP attestation, destination tx hash, and final status.
- EVM explorer shows a CCTP burn transaction on the selected source chain.
- Stellar explorer shows the `mint_and_forward` transaction.

## Rollback Or Pause Notes

- Disable the bridge UI if live testnet burns fail unexpectedly.
- Stop the `bridge-confirmation` worker independently if Circle Iris or RPC providers are degraded.
- Existing pending transfers remain recoverable through Wallet page refresh/manual refresh.

## Pass Criteria

- EVM to Stellar live transfer can be created from the Wallet page.
- The app asks for ERC-20 approval only when needed.
- The app submits a raw CCTP V2 source burn without Circle Bridge Kit.
- The source tx hash is persisted and resumable.
- Circle attestation readiness advances the transfer to `Ready to complete`.
- Vaquita relays Stellar `mint_and_forward` without a second user wallet prompt.
- The destination tx hash is persisted and the transfer completes.

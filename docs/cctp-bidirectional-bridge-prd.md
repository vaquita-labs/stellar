# Bidirectional CCTP USDC Bridge PRD

## Problem Statement

Vaquita is a Stellar-first savings app, but many users hold USDC on EVM networks such as Base and Ethereum. Today those users must leave Vaquita, find a third-party bridge, move USDC to Stellar, return to the app, and then deposit into Vaquita. The same problem appears in reverse when a user wants to move withdrawn Stellar USDC back to an EVM wallet.

This creates drop-off, support risk, and a confusing funding path for users who understand USDC but do not understand the Stellar-specific bridge mechanics. It is especially risky because CCTP transfers are multi-step: a user burns on the source chain, waits for Circle attestation/finality, then completes the mint or receive step on the destination chain. If the browser closes mid-flow, a client-only implementation would leave the user without a clear recovery path.

## Solution

Build a bidirectional USDC bridge experience inside Vaquita using raw CCTP V2 flows wrapped in Vaquita-owned modules. The first supported EVM networks are Base and Ethereum, with testnet support for Base Sepolia and Ethereum Sepolia before mainnet rollout.

The bridge lives primarily on the Wallet page as a "Bridge USDC" action. The Deposit modal also includes a contextual helper link for users who need USDC before saving. The MVP bridges funds between the user's EVM wallet and Stellar wallet; it does not automatically deposit bridged funds into VaquitaPool.

Vaquita tracks user-initiated bridge transfers in the database and exposes resumable status through the API. The backend does bounded polling for known transfers only: source transaction confirmation, Circle attestation readiness, and destination transaction confirmation. It does not run a continuous blockchain event listener and does not scan Base, Ethereum, or Stellar globally.

For production, add a lightweight Dokploy worker for bridge confirmation. The worker processes non-terminal bridge transfers in bounded batches with locking/leases so multiple worker instances cannot race. The UI also supports lazy refresh and manual refresh, so users can resume even if the worker is temporarily unavailable.

## User Stories

1. As a Vaquita user with USDC on Base, I want to bridge USDC to Stellar, so that I can save in Vaquita without leaving the app.
2. As a Vaquita user with USDC on Ethereum, I want to bridge USDC to Stellar, so that I can fund my Stellar wallet from a familiar EVM account.
3. As a Vaquita user with Stellar USDC, I want to bridge USDC to Base, so that I can move funds back to a low-fee EVM network.
4. As a Vaquita user with Stellar USDC, I want to bridge USDC to Ethereum, so that I can return funds to my Ethereum wallet.
5. As a Vaquita user, I want the Wallet page to show a Bridge USDC entry point, so that bridging feels like a wallet action rather than a savings action.
6. As a Vaquita user trying to deposit without enough Stellar USDC, I want the Deposit modal to offer a bridge helper link, so that I can fund the wallet before saving.
7. As a Vaquita user, I want to choose bridge direction, so that I can move USDC either into or out of Stellar.
8. As a Vaquita user, I want to choose Base or Ethereum as the EVM side, so that I can use the chain where my USDC already lives.
9. As a Vaquita user, I want clear source and destination wallet addresses before signing, so that I do not bridge to the wrong account.
10. As a Vaquita user, I want Vaquita to validate my Stellar address, so that invalid destination addresses are rejected before funds move.
11. As a Vaquita user, I want Vaquita to validate my EVM address, so that invalid destination addresses are rejected before funds move.
12. As a Vaquita user, I want to connect an injected EVM wallet, so that I can sign Base or Ethereum transactions with MetaMask, Coinbase Wallet extension, Rabby, or a compatible browser wallet.
13. As a Vaquita user, I want to keep my existing Stellar wallet connection, so that CCTP support does not replace the Pollar/Stellar flow.
14. As a Vaquita user, I want to see available USDC balance on the selected source chain, so that I do not attempt an impossible transfer.
15. As a Vaquita user, I want Vaquita to warn me about network fees and source-chain requirements, so that I understand that EVM gas or Stellar fees may be needed.
16. As a Vaquita user, I want amount entry to respect USDC decimal differences between EVM and Stellar, so that I do not bridge the wrong raw amount.
17. As a Vaquita user, I want the app to ask for ERC-20 approval only when needed, so that I do not sign unnecessary transactions.
18. As a Vaquita user, I want the app to show each CCTP step, so that I know whether I am approving, burning, waiting for attestation, or completing the destination step.
19. As a Vaquita user, I want to close the browser after the source burn and resume later, so that a long attestation wait does not trap me on one screen.
20. As a Vaquita user, I want pending transfers visible on the Wallet page, so that I can finish transfers that are ready to complete.
21. As a Vaquita user, I want a manual refresh button, so that I can check whether an attestation or destination confirmation is ready.
22. As a Vaquita user, I want Vaquita to preserve transaction hashes, so that I can inspect source and destination transactions in explorers.
23. As a Vaquita user, I want completed transfers to show a final success state, so that I know the bridge is done.
24. As a Vaquita user, I want failed or stale transfers to show a recoverable state when possible, so that I know what action to take next.
25. As a Vaquita user, I want a transfer marked "needs review" after repeated confirmation failure, so that I know support or manual inspection is required.
26. As a Vaquita user, I want the bridge not to auto-deposit into VaquitaPool, so that I remain in control of when savings deposits are created.
27. As a Vaquita user, I want the app to return me to the deposit flow after bridging from the helper link, so that funding and saving feel connected.
28. As a Vaquita user, I want the bridge UI to be clear about CCTP finality delays, so that waiting does not feel like a broken transaction.
29. As a Vaquita user, I want the UI to prevent changing transfer parameters after a burn has started, so that the recorded transfer remains consistent with the signed transaction.
30. As a Vaquita user, I want to import or resume a transfer by known source transaction hash if possible, so that I can recover a transfer started before a page refresh.
31. As a Vaquita support operator, I want bridge transfers stored with source and destination metadata, so that I can help users without asking them to reconstruct every step.
32. As a Vaquita support operator, I want to see transfer status, transaction hashes, attestation status, and stale reasons, so that I can distinguish normal waiting from failure.
33. As a Vaquita operator, I want bridge confirmation polling bounded to known transfers, so that the feature does not become a chain indexer.
34. As a Vaquita operator, I want bridge confirmation deployed as a separate Dokploy worker, so that bridge polling can be scaled or paused independently from the API.
35. As a Vaquita operator, I want worker leases or row locks, so that two worker instances do not process the same transfer at the same time.
36. As a Vaquita operator, I want the worker to batch pending rows with strict limits, so that high activity does not create unbounded API or RPC load.
37. As a Vaquita operator, I want stale transfers to age out into a review state, so that old records do not poll forever.
38. As a Vaquita operator, I want per-environment CCTP configuration, so that testnet and mainnet addresses/domains cannot be mixed accidentally.
39. As a Vaquita operator, I want bridge feature flags, so that the bridge can be enabled on testnet before mainnet.
40. As a Vaquita operator, I want structured logs for bridge status transitions, so that production issues can be diagnosed without logging private data.
41. As a Vaquita operator, I want metrics for pending, ready, completed, failed, and stale transfers, so that operational health is visible.
42. As a Vaquita developer, I want a shared CCTP configuration module, so that chain domains, contract addresses, decimals, and RPC settings are centralized.
43. As a Vaquita developer, I want the CCTP module to expose a small interface, so that frontend, API, and worker code do not duplicate bridge rules.
44. As a Vaquita developer, I want testnet-first support, so that EVM-to-Stellar and Stellar-to-EVM can be smoke-tested before mainnet.
45. As a Vaquita developer, I want typed bridge statuses, so that the frontend can branch safely on machine-readable states.
46. As a Vaquita developer, I want bridge APIs to be idempotent, so that retries and page refreshes do not duplicate transfers.
47. As a Vaquita developer, I want the worker to confirm specific tx hashes and messages, so that confirmation logic remains scoped and testable.
48. As a Vaquita developer, I want CCTP amount conversion tests, so that 6-decimal EVM USDC and 7-decimal Stellar units are handled correctly.
49. As a Vaquita developer, I want address validation tests, so that Stellar strkeys and EVM addresses are validated before signing.
50. As a Vaquita developer, I want mocked Circle attestation tests, so that status transitions can be tested without live Circle dependencies.
51. As a Vaquita developer, I want UI states tested around interrupted transfers, so that users can resume after closing the browser.
52. As a release engineer, I want bridge configuration documented in the Dokploy runbook, so that deployment does not rely on tribal knowledge.
53. As a release engineer, I want the bridge worker's environment variables documented, so that production and staging deployments are repeatable.
54. As a release engineer, I want mainnet bridge activation to be explicit, so that testnet validation does not accidentally enable real-funds flows.
55. As a compliance or risk reviewer, I want the bridge to remain non-custodial, so that Vaquita does not take control of user funds.
56. As a compliance or risk reviewer, I want the app to avoid storing private keys or signing material, so that bridge tracking does not create custody risk.
57. As a compliance or risk reviewer, I want clear user-facing source and destination disclosure, so that users understand where funds are moving.

## Implementation Decisions

- Build raw CCTP V2 flows directly. Do not use Circle Bridge Kit because Bridge Kit does not support Stellar as a destination/source for this route.
- Support bidirectional flows: EVM to Stellar and Stellar to EVM.
- First EVM networks are Base and Ethereum, with Base Sepolia and Ethereum Sepolia used for testnet validation.
- Keep the EVM chain list configuration-driven so additional EVM networks can be added later.
- Add a minimal injected EVM wallet layer using the repo's chosen EVM libraries at implementation time; do not require WalletConnect/mobile support in the MVP.
- Keep the existing Stellar/Pollar wallet path for Stellar signing.
- Bridge into the user's wallet only. Do not auto-deposit bridged funds into VaquitaPool in this issue.
- Place the main Bridge USDC flow on the Wallet page.
- Add a helper link in the Deposit modal that opens the bridge flow when a user needs Stellar USDC.
- Store user-initiated bridge transfers in a new database model with direction, source/destination chain, source/destination wallet, amount, status, transaction hashes, attestation/message metadata, timestamps, retry metadata, and stale/review reasons.
- Use typed bridge statuses such as draft, source awaiting signature, source confirming, attestation pending, ready to complete, destination awaiting signature, destination confirming, completed, failed, cancelled, and needs review.
- Add API endpoints to create a transfer, attach source transaction data, refresh transfer status, attach destination transaction data, list active transfers for a wallet, and recover/import a known transfer when practical.
- Make API writes idempotent. A repeated source tx attach or destination tx attach should not create duplicate bridge records.
- Add a shared CCTP module that owns chain/domain config, address validation, amount conversion, attestation parsing, status normalization, and explorer URL generation.
- Treat amount conversion as a critical domain boundary. EVM USDC and Stellar USDC use different base-unit conventions, so conversions must use integer math and explicit decimals.
- Implement lazy refresh in the Wallet UI and a manual refresh action.
- Add a separate bridge confirmation worker for production deployment. The worker polls only non-terminal rows created by Vaquita or explicitly imported by a user.
- The worker must not scan whole chains, subscribe to all chain events, or behave like a general blockchain listener.
- The worker should process bounded batches, use a lease or row-lock pattern, and ignore or review stale transfers after a configurable age.
- Deployment should be one shared worker process, not one poller per user or per transfer.
- Keep polling intervals and batch sizes configurable by environment.
- Add feature flags for testnet and mainnet bridge availability.
- Log bridge state transitions with transaction hashes and transfer ids, but do not log private keys, secrets, raw auth tokens, or unnecessary personal data.
- Update Dokploy documentation with the bridge worker process, required runtime environment variables, and the difference between lazy refresh and background confirmation.
- Mainnet activation should require explicit config and runbook review after testnet smoke tests.

## Testing Decisions

- Good tests should assert external behavior: status transitions, validation outcomes, API responses, resumability, and transaction/attestation interpretation. They should not assert internal helper call order.
- Test the shared CCTP module for supported chains, unsupported chains, CCTP domain selection, address validation, explorer URLs, and integer amount conversion.
- Test transfer state transitions with mocked source confirmations, mocked Circle attestation responses, mocked destination confirmations, retry paths, stale paths, and idempotent repeated API calls.
- Test API endpoints for invalid payloads, wallet mismatches, duplicate tx submissions, status refresh behavior, and terminal-state immutability.
- Test the bridge confirmation worker with multiple pending rows, batch limits, leases, stale transfer handling, and no-op behavior when there are no pending transfers.
- Test the Wallet UI for direction selection, EVM chain selection, injected wallet missing state, source/destination address display, pending transfer resume, ready-to-complete state, and completed state.
- Test the Deposit modal helper link to ensure it opens or routes to the bridge flow without altering the existing VaquitaPool deposit transaction path.
- Prior art in this repo includes deposit route tests and service tests for shared behavior, Prisma-backed service patterns, Stellar transaction helpers, and mainnet readiness worker/runbook issues. Follow those patterns rather than adding a new framework.

## Out of Scope

- Automatic deposit into VaquitaPool after bridging.
- WalletConnect and mobile deep-link EVM wallet support.
- Additional EVM networks beyond Base and Ethereum.
- A general-purpose Base, Ethereum, or Stellar chain listener.
- Custodial bridging, server-side signing, managed user keys, or Vaquita-controlled funds.
- Liquidity routing outside CCTP.
- Fiat on-ramp/off-ramp support.
- Admin UI for bridge support operations, beyond storing enough data for API/log inspection.
- Mainnet execution before explicit testnet validation and deployment review.

## Further Notes

- The implementation must verify current Circle CCTP V2 contract addresses, domains, message formats, finality behavior, and Stellar forwarder requirements from official Circle documentation during implementation.
- Stellar-specific CCTP behavior should be treated as a high-risk integration boundary. The implementation should include testnet smoke steps for EVM to Stellar and Stellar to EVM before enabling mainnet.
- The bridge should be framed as a wallet funding and withdrawal utility. Vaquita savings deposits remain a separate explicit user action.
- The safest production polling model is one bounded worker shared by all bridge transfers, with lazy UI refresh as a fallback.

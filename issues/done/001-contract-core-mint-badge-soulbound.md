## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

Deploy the `vaquita-badges` Soroban smart contract with its complete core logic:
`initialize`, `mint_badge` (Ed25519 signature verification, `expiry` check, double-claim
prevention via `Claimed` key, mint), `transfer()` soulbound block, `owner_of`, and
`total_supply`. Storage layout as specified in §4.1. All contract unit tests passing.

This slice does not include backend signing, claim API, or frontend — it is the on-chain
foundation that every other slice depends on.

See §4 (Contract Architecture), §5 (Issuance Flow — contract-side steps), and §8
(Security Properties) of the whitepaper.

## Acceptance criteria

- [ ] `initialize(admin, signing_key)` stores admin and Ed25519 public key; reverts on re-init
- [ ] `mint_badge(wallet, badge_type, cycle_id, expiry, signature)` verifies Ed25519 sig over `sha256(wallet || badge_type || cycle_id || expiry)`
- [ ] `mint_badge` reverts if `ledger::timestamp() >= expiry`
- [ ] `mint_badge` reverts with `AlreadyClaimed` if `Claimed(badge_type, cycle_id, wallet)` already exists
- [ ] `mint_badge` returns the new `token_id` and marks `Claimed` key in persistent storage
- [ ] `transfer()` panics unconditionally with `SoulboundToken`
- [ ] `owner_of(token_id)` returns the correct owner address
- [ ] `total_supply()` returns the current token count
- [ ] All unit tests pass (`cargo test --workspace`)
- [ ] Contract builds to WASM without errors (`stellar contract build`)

## Blocked by

None — can start immediately.

## User stories addressed

- User wants to claim a badge and have permanent, verifiable on-chain proof of ownership
- Protocol needs replay and double-claim prevention across all badge categories
- Protocol needs soulbound guarantee (no secondary market, no transfers)

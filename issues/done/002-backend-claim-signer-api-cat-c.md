## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

Build the backend claim signing service and claim API endpoint, end-to-end, for one
Category C badge (Primera Vaquita). This is the backbone all other categories reuse:
the admin Ed25519 key (from `.env`), the signing logic over
`sha256(wallet || badge_type || cycle_id || expiry)`, and the
`GET /api/claim?type=primera_vaquita&wallet=G...` endpoint that returns a signed payload
ready to pass to `mint_badge`.

A wallet that completed its first cycle should be able to hit the API, receive a valid
signed claim, and successfully call `mint_badge` on testnet.

See §5 (Issuance Flow), §7 (Off-Chain Infrastructure), and FAQ §Admin Key Custody of
the whitepaper.

## Acceptance criteria

- [ ] Admin Ed25519 key loaded from `.env` / secrets manager (never hardcoded)
- [ ] Signing service produces valid Ed25519 signatures verifiable by the contract
- [ ] `GET /api/claim?type=primera_vaquita&wallet=G...` returns `{ badge_type, cycle_id, expiry, signature }` for eligible wallets
- [ ] `expiry` defaults to `now + 30 days`
- [ ] API returns 403 for wallets not eligible for the requested badge type
- [ ] API returns 409 if the wallet already has a confirmed on-chain claim for this badge
- [ ] Full end-to-end test: eligible wallet → API → `mint_badge` on testnet → badge minted
- [ ] `cycle_id = 0` used for Cat C as specified

## Blocked by

- Blocked by `issues/001-contract-core-mint-badge-soulbound.md`

## User stories addressed

- User who completed their first savings cycle can claim their Primera Vaquita badge
- Protocol backend authorizes mints without exposing the signing key to the frontend

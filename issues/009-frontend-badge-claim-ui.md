## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

Build the frontend badge claim UI within the existing Next.js app (`apps/web`). Users
should be able to see all badges they are eligible to claim, view badge artwork and
metadata, and submit the claim transaction in one click. The UI integrates the claim API
(signed payload) and the fee-bumped transaction submission (Privy + Pollar).

The badge display should also show already-minted badges in the user's wallet as part
of their profile/identity within Vaquiland.

See §3 (Badge Catalogue — metadata examples), §5 (Issuance Flow — step 3 and 4), and
§7 (Metadata API) of the whitepaper.

## Acceptance criteria

- [ ] Profile page shows all minted badges for the connected wallet (fetched from Metadata API)
- [ ] "Claim" section shows pending eligible badges (fetched from claim API)
- [ ] Clicking "Claim" on an eligible badge submits the fee-bumped `mint_badge` transaction
- [ ] UI shows success state with badge artwork after confirmed mint
- [ ] UI shows correct error state if claim fails (already claimed, expired sig, etc.)
- [ ] Re-sign flow is transparent: if a stored sig is expired, the frontend silently calls the refresh endpoint before submitting
- [ ] Works with Stellar Wallets Kit (Freighter and other supported wallets)

## Blocked by

- Blocked by `issues/007-metadata-api.md`
- Blocked by `issues/008-fee-bumping-privy-pollar.md`

## User stories addressed

- Users can discover, claim, and display their earned badges from within Vaquiland
- Badge ownership becomes part of the user's on-chain identity and profile

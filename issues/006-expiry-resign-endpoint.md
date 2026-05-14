## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

Build the re-sign endpoint that allows users to obtain a fresh signature when their
original claim has expired. From the user's perspective, claiming is always available —
the re-sign logic is transparent. The endpoint re-verifies eligibility before issuing
a new signature with a fresh `expiry = now + 30 days`.

Re-issuance policy (from FAQ):
- **Cat A, B, C**: automatic — eligibility is permanent once earned
- **Cat D**: manual, requires team approval (endpoint returns 403 with a support link)

The endpoint must also reject re-sign requests for wallets that have already
successfully minted the badge on-chain (check via RPC before signing).

See FAQ §`expiry` — Claim Window and Re-issuance of the whitepaper.

## Acceptance criteria

- [ ] `POST /api/claim/refresh` accepts `{ wallet, badge_type, cycle_id }` and returns a new signed claim for Cat A/B/C if eligible
- [ ] Returns 403 for Cat D re-sign requests (manual process)
- [ ] Returns 409 if the badge has already been minted on-chain for this wallet
- [ ] New `expiry = now + 30 days` on every re-issued signature
- [ ] Original claim record in Supabase is superseded (not duplicated)
- [ ] End-to-end test: wallet has expired Cat A claim → calls refresh → receives valid new sig → mints successfully

## Blocked by

- Blocked by `issues/002-backend-claim-signer-api-cat-c.md`

## User stories addressed

- User who missed the original 30-day claim window can still claim their earned badge
- Protocol retains the security benefit of short-lived signatures without creating UX friction

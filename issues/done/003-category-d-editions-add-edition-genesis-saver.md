## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

Add limited-edition (Category D) support to the contract and backend:
- `add_edition(edition_id, max_supply)` admin function in the contract, with
  `EditionCap` and `EditionCount` persistent storage keys
- `mint_badge` checks `EditionCount < EditionCap` before minting Cat D badges
- Backend FIFO counter for Genesis Saver (D1): the first 50 wallets to deposit on
  testnet are eligible; counter is stored in the backend DB and stops issuing D1
  signatures once it hits 50

A wallet that is among the first 50 testnet depositors should be able to claim the
Genesis Saver badge; wallet #51 must be rejected.

See §3.4 (Category D), §4.1 (EditionCap/EditionCount storage), §4.2 (`add_edition`),
and FAQ §Category D — Eligibility of the whitepaper.

## Acceptance criteria

- [ ] `add_edition(edition_id, max_supply)` stores cap in persistent storage; only admin can call
- [ ] `mint_badge` for a Cat D `badge_type` increments `EditionCount` and reverts with `EditionCapReached` if count would exceed cap
- [ ] Backend tracks D1 deposit count in Supabase; stops signing D1 claims at 50
- [ ] `GET /api/claim?type=genesis_saver&wallet=G...` returns signed claim for eligible wallets and 403 once cap is reached
- [ ] `cycle_id = 0` used for Cat D as specified
- [ ] End-to-end test: wallet #1 and #50 can claim; wallet #51 is rejected at API level

## Blocked by

- Blocked by `issues/001-contract-core-mint-badge-soulbound.md`

## User stories addressed

- Early testnet users receive a limited-edition Genesis Saver badge as recognition
- Protocol guarantees no more than 50 Genesis Saver badges can ever exist

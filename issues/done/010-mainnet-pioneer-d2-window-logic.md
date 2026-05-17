## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

Implement the backend logic for the Mainnet Pioneer (D2) badge. The backend detects
first deposits on mainnet within the 7-day launch window and issues signed D2 claims.
Key rules (from FAQ): no numeric cap (all qualifying wallets receive the badge), testnet
history does not disqualify a wallet, and the criterion is purely temporal.

Requires defining the mainnet launch timestamp as a configurable value in the backend
(not hardcoded), so the window can be set at deploy time.

See §3.4 (Category D — Mainnet Pioneer) and FAQ §Category D — Eligibility of the
whitepaper.

## Acceptance criteria

- [ ] Mainnet launch timestamp is configurable via environment variable (not hardcoded)
- [ ] Backend detects confirmed first deposits on mainnet and checks if they fall within days 1–7 of launch
- [ ] D2 signed claim issued for every qualifying wallet (no cap check needed — no edition cap for D2)
- [ ] Wallets with prior testnet deposits are not excluded
- [ ] Wallets that deposit after day 7 do not receive a D2 claim
- [ ] Idempotent: re-processing the same deposit event does not issue duplicate claims
- [ ] End-to-end test: simulated mainnet launch → deposit on day 3 → D2 claim issued → badge minted

## Blocked by

- Blocked by `issues/003-category-d-editions-add-edition-genesis-saver.md`

## User stories addressed

- Early mainnet adopters are permanently recognized as Mainnet Pioneers
- Protocol rewards users who take a chance on the platform at launch

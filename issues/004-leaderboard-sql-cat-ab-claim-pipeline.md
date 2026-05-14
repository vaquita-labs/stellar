## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

Implement the leaderboard scoring SQL query and the cycle-close pipeline that issues
signed Cat A/B badge claims. At month close, the backend runs the scoring query,
determines the top 10 wallets, and issues signed claims for Vaquero de Oro (A1),
Vaquero de Plata (A2), Vaquero de Bronce (A3), and Top 10 Contributor (B1).
Ranks #1–3 receive two signed claims each (one Cat A + one Cat B).

The live leaderboard endpoint (`GET /network/:networkName/leaderboard?cycle=YYYYMM`)
should also be operational for the frontend ticker.

See §9 (Leaderboard Scoring), §3.1, §3.2, and §5 (Issuance Flow — Cat A/B) of the
whitepaper.

## Acceptance criteria

- [ ] SQL query (§9.3) returns correct USDC×seconds scores for a test dataset with deposits and withdrawals across a cycle boundary
- [ ] `GET /network/:networkName/leaderboard?cycle=YYYYMM` returns ranked list with `walletAddress`, `score`, `activeAmount`, `cycleStart`, `cycleEnd`
- [ ] Cycle-close job signs Cat A/B claims with `cycle_id = YYYYMM`; ranks #1–3 receive both an A and a B signed claim
- [ ] Tiebreaker applied: most `total_completed_cycles` first, then earliest `last_deposit_timestamp`
- [ ] Signed claims are stored in Supabase and served via the claim API for the relevant wallets
- [ ] `cycle_id` in the signed payload prevents cross-cycle replay (a May 2026 sig is rejected for June 2026)
- [ ] End-to-end test: cycle closes → top-10 claims issued → wallet #1 mints Vaquero de Oro on testnet

## Blocked by

- Blocked by `issues/002-backend-claim-signer-api-cat-c.md`

## User stories addressed

- Top savers of the month receive prestigious podium badges as recognition
- Users can watch their live score on the leaderboard during the cycle

## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

Build the backend claim monitor service that watches on-chain and off-chain events to
auto-detect Category C milestone eligibility and issue signed claims without manual
intervention. Covers all five Cat C badges: Primera Vaquita (first completed cycle),
Maratonista (first 6-month cycle), Trimestral (first 3-month cycle), Disciplinado
(30-day activity streak), and Veterano (12 cycles without penalty).

The monitor listens to confirmed withdrawal events from `vaquita-pool` (via the existing
listener infrastructure) and evaluates milestone conditions per wallet in Supabase.

See §3.3 (Category C), §5 (Issuance Flow — Cat C), and §7 (Claim monitor) of the
whitepaper.

## Acceptance criteria

- [ ] Monitor detects a confirmed on-time withdrawal and checks all Cat C conditions for the wallet
- [ ] Primera Vaquita claim issued on first completed cycle (any period); not re-issued if already minted
- [ ] Maratonista claim issued on first completed 6-month cycle
- [ ] Trimestral claim issued on first completed 3-month cycle
- [ ] Veterano claim issued after 12 completed cycles with no early withdrawals
- [ ] Disciplinado claim issued after 30 consecutive days of platform activity
- [ ] All issued claims stored in Supabase and retrievable via claim API
- [ ] Monitor is idempotent: re-processing the same event does not issue duplicate claims

## Blocked by

- Blocked by `issues/002-backend-claim-signer-api-cat-c.md`

## User stories addressed

- Users automatically receive milestone badges when they complete savings goals without needing to manually trigger a check

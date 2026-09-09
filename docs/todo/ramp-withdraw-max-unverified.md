# The corridor withdrawal's "max" correction has never run against Pollar

Tapping the available chip on the Bolivian withdrawal types the whole balance,
and that is the one amount with no room to be wrong. The first attempt at it
failed in the browser, the failure was diagnosed and fixed, and **the fix has
only ever been simulated.**

## What happened

The keypad is in USDC and the provider quotes in local currency, so the amount is
converted with the rate the schema probe measures on a nominal ticket. Measured
at 100 BOB, that rate came out **0.055 % high**:

| | |
| --- | --- |
| Balance | `217.470244 USDC` |
| Chip typed | `217.47` (balance minus `FUNDING_DUST`) |
| Probe rate (implied) | `12.264312` |
| Asked for | `2667.12 BOB` |
| Quote's real rate | `12.257549` → charge `217.59 USDC` |
| Result | `217.5901 > 217.470244` — `costProblem` refused it |

Invisible at any other amount. At the maximum it is twelve cents of USDC and the
charge does not fit.

## The fix, and what is unproven about it

`ensureQuote` now corrects once, and only when the charge overshoots: it measures
the rate on the quote that just came back — taken at the real amount, not at the
nominal — converts again, shaves a cent of local currency so the retry lands
strictly under the balance rather than exactly on it, and asks a second time. A
normal amount still costs a single call.

Simulated against the numbers above it lands with **0.0017 USDC of margin**.
Simulation is all it is. Not verified:

- [ ] That two requests to `/ramps/quote` actually go out on the max, and the
      second one is accepted.
- [ ] That `measuredRate` returns something sane on the real payload across
      corridors — the arithmetic was checked against one captured response.
- [ ] That the shaved retry stays inside the route's `minAmount`/`maxAmount`.
- [ ] That `requestedFiat` — the local figure the winning quote was asked for —
      is what reaches `createOfframp`. Pollar re-quotes with it when it creates
      the order, so sending the on-screen conversion instead would order a
      different withdrawal.

## Why there is no test for it

The flow cannot be automated: it quotes against the live provider and pays out to
a real bank account. See the note in `apps/web/e2e/README.md` — the same reason
the on-ramp stops at the country picker. This has to be a manual pass by someone
with a Bolivian account, and it is worth doing before the corridor is announced
to anyone.

## If it fails again

The safety net holds either way: `costProblem` refuses before a single USDC
leaves the vault, so the worst case is a message and no movement. What to capture
is **both `cryptoAmount` values** — the first quote's and the retry's — plus the
`fiatAmount` of each. Those four numbers say whether the shave is too small or
the measured rate is off by more than one correction can absorb.

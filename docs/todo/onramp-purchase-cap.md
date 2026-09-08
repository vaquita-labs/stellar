# The 1000 BOB ceiling on a purchase is ours, and it is temporary

`ONRAMP_CORRIDORS.BO.maxFiat = 1000` refuses a purchase above 1000 bolivianos
(~145 USD). **Pollar does not ask for this.** Every quote publishes its own
`maxAmount` and it sits far above ours — the route would take the money.

It is a self-imposed bound while the Bolivian corridor is new: it caps what a
single purchase can put at stake before anyone has watched enough of them settle
end to end. It is meant to be raised or removed, not defended.

## Where it lives

- `apps/web/src/networks/pollar/rampsOnramp.ts` — `maxFiat` on the corridor,
  beside the `minFiat` it mirrors.
- `apps/web/src/core-ui/components/organisms/FiatModals/ReceiveFiatRampModal.tsx`
  — `aboveMax` joins `belowMin` in `amountValid`, so an amount over the cap never
  reaches `/ramps/quote`.
- `wallet.fiat.onramp.maxAmount` in the three locales.

The screen says *"The maximum purchase is 1000 BOB"*, worded like the floor
beside it and with no explanation attached. Whose ceiling it is belongs in this
doc, not on a keypad: the user's next move is the same either way, and a screen
that justifies its own limits invites an argument the screen cannot settle.

## Why it is checked before the quote

Same reason as the floor: there is no quote yet, so there is no `maxAmount` to
compare against. Stopping here also spares the provider a call for a purchase
that was never going to be allowed through.

The consequence is that **our cap hides the route's.** If Pollar ever lowers
`maxAmount` below 1000 for this corridor, the user meets our message instead of
theirs. Not a problem while ours is the stricter one by a wide margin — it is a
problem the moment this cap is raised.

## Before raising or removing it

- [ ] Watch enough purchases settle at the current ceiling: the QR paid, the USDC
      credited, and the figure on screen matching what the ledger shows
      (`0689157` fixed that number recently — it used to be the estimate).
- [ ] Decide what replaces it. Dropping `maxFiat` altogether hands the ceiling
      back to the quote's `maxAmount`, which is the correct end state; raising it
      keeps two ceilings and the shadowing above.
- [ ] If the cap stays for long, it belongs in configuration rather than a
      literal — a limit that needs a deploy to change is a limit nobody adjusts.

## Not to be confused with

The withdrawal side has no such cap. The corridor off-ramp is bounded by the
balance and by the route's own limits, and its open question is a different one —
see `ramp-corridor-probe-coverage.md`.

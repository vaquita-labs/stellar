# Brazil and Colombia lost their keypad when the corridor withdrawal moved to USDC

`861cce5` made the corridor off-ramp type its amount in USDC, like every other
withdrawal. `/ramps/quote` cannot be asked in USDC — it filters providers by the
corridor's `fiat_currency` and returns an empty list — so what bridges the two is
the exchange rate the **schema probe** measures.

The probe only exists for Bolivia. Everywhere else there is no rate, and with no
rate the screen cannot convert what was typed into something to ask for.

## 1. What breaks

`apps/web/src/core-ui/components/organisms/FiatModals/SendFiatRampModal.tsx:117`

```ts
const PROBE_AMOUNT: Partial<Record<CorridorCode, number>> = { BO: 100 };
```

With no entry for the corridor the probe never runs, so `probe.rate` stays null:

```ts
const rate = probe?.country === country ? probe.rate : null;                    // :407
const amountNum = rate != null && usdcValid ? floorAmount(usdcNum * rate, …) : NaN;
const amountValid = usdcValid && Number.isFinite(amountNum) && amountNum > 0;   // :423
```

`amountValid` is false forever, so the Continue button never enables and the
line under the figure reads *"The rate for this corridor is unavailable right
now."* The keypad types, and nothing else happens.

**This is reachable today.** `DepositPanel.tsx:159` offers all three corridors on
the withdraw flow, and only Bolivia is behind a flag:

```ts
countryFlow === 'withdraw' ? (bolivia ? ['AR', 'BR', 'CO', 'BO'] : ['AR', 'BR', 'CO']) : …
```

Argentina is unaffected — it goes to `SendFiatModal` (Anclap), which runs the
USDC to ARS swap itself and never needed a rate.

## 2. Why the probe is Bolivia-only

The restriction is deliberate and documented at `PROBE_AMOUNT`: the probe is
defined ONLY where the corridor pays out over a single rail. Bolivia settles over
ACH and nothing else, so any amount resolves to the same route. Colombia goes out
over PSE **or** Bre-B, and a nominal could draw the form of a route the real
amount never quotes — the user would fill in details for the wrong bank.

That reasoning was written for the FIELD LIST, and it does not transfer unchanged
to the rate:

- A wrong-rail **form** is a silent corruption: the user types a PSE account for
  a withdrawal that settles over Bre-B, and nothing catches it.
- A wrong-rail **rate** is only a bad first estimate. The quote for the real
  amount re-resolves the rail, and `ensureQuote` validates the route's limits and
  the charge against the balance before anything moves.

So a corridor could plausibly have a rate probe without having a schema probe.
That is the decision this doc is asking for, not a foregone conclusion.

## 3. Options

### Option A — Give BR and CO a probe amount

- [ ] Add nominals to `PROBE_AMOUNT` for `BR` and `CO`, each verified to sit
      above the corridor's minimum (`PROBE_RETRY_FACTOR` covers being under it
      once, but a nominal chosen right costs one call instead of two).
- [ ] Decide whether Colombia's probe may also supply `requiredFields`, or only
      the rate. Keeping the field list off for multi-rail corridors preserves the
      original guarantee while unblocking the keypad — it needs the probe result
      to carry which of the two it is allowed to feed.

### Option B — Take BR and CO out of the picker

- [ ] Drop them from `DepositPanel.tsx:159` until Option A lands.
- [ ] Only defensible as a short stop-gap: those corridors work today.

### Option C — Fix it at the source

- [ ] Ask Pollar for a quote by CRYPTO amount (`amount` in USDC, or an
      `amountCurrency` parameter). The probe, the rate, the conversion and the
      corrective re-quote all disappear, and the max becomes exact instead of
      estimated. `getRampsQuote` takes `{ country, amount, currency, direction }`
      and nothing else today.

## 4. What must not regress

- **Argentina stays out of this.** It is a different modal and a different
  provider; nothing here should touch `SendFiatModal`.
- **The charge is never derived.** What the withdrawal costs is `cryptoAmount`,
  fixed by the quote. The rate only decides what to ASK for, and `costProblem`
  checks the charge against the balance before the USDC leaves the vault.
- **The single-rail guarantee on FIELDS.** If a multi-rail corridor gets a probe,
  the form it draws must still come from a quote for the real amount.

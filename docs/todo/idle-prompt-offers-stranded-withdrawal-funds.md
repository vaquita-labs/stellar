# The idle-funds prompt still offers money a half-done withdrawal left behind

A withdrawal to another wallet is two non-atomic txs: the money leaves savings
into the user's own wallet, and a second payment sends it on. Between them it
sits in the wallet by design, and `useIdleFunds` reads the whole wallet balance
as idle.

The prompt no longer opens *during* that window — it refuses to open while any
modal is on screen, and every money sheet is unclosable while its transaction is
in flight, so "nothing on screen" means "nothing in flight". What is left is the
case where the flow ends without the money moving on.

## The two ways money gets stranded

| | What the user sees |
| --- | --- |
| The payment leg fails | `WithdrawModal` lands on its `partial` step with a "finish the payment" button. Closing that sheet leaves the money in the wallet. |
| The page reloads mid-flight | The tab that was going to send the second leg is gone. Nothing records that a leg is owed. |

In both, no modal is on screen and the money is genuinely at rest, so the prompt
opens and offers to put it to work. Accepting moves it into the vault.

## Why this is not urgent

No funds are lost. The payment never left, so the user has to redo the whole
withdrawal either way, and the money is in their vault rather than gone. What it
costs is comprehension: the app offers to invest money the user had already
decided to send to someone else, with no hint that a payment is owed.

## Why the current guards cannot cover it

The screen check answers "is something in flight", and here nothing is. The
in-memory flags cannot help either: `useRampActiveStore` and
`usePendingCreditStore` both die with the tab, and a reload is one of the two
ways to reach this state. `PendingWithdrawPayment` already models the owed leg
(`networks/stellar/withdrawError.ts`) but only lives inside the thrown error, so
it dies with the sheet.

## What would fix it

Record the owed leg where it survives the tab — the same shape
`PendingWithdrawPayment` already has, persisted with an amount and an expiry, so
`idle` can be the wallet balance minus what is owed rather than the whole
balance. That also gives the user a way back into the half-done withdrawal after
a reload, which today only exists while the sheet is open.

Server-side is the stronger version: the unpaid leg is currently reported only
as telemetry (`trackError`, context `withdraw_payment_leg` in
`DepositPanel.tsx`), so support cannot see one without reading the chain.

## Where to look

- `core-ui/hooks/useAutoInvest.ts` — `idle` and `shouldPrompt`.
- `core-ui/components/home/AutoInvest.tsx` — the screen check that covers the
  in-flight window.
- `core-ui/components/organisms/WithdrawModal/WithdrawModal.tsx` — the `partial`
  step and its resume button.

# Push notifications — checking delivery in production

How the two senders work is in `CLAUDE.md` → **Push notifications**.

**How to check whether prod actually has keys — and the trap.** The repo's
`apps/api/.env.production` reports `VAPID_PUBLIC_KEY: (UNSET)`, and that proves **nothing**:
prod is redeployed by hand in Dokploy, which holds its own env (see **CI** — CI only deploys
dev). The evidence has to come from data instead: a `push_campaigns` row with `push_sent > 0`
and `push_failed = 0` means the live container holds a matched key pair, because a mismatched
one 403s into `push_failed`. Then count `push_subscriptions` for the receiver *as of* the
notification's `created_at` — a subscription created later could not have received it.
`apps/api/tmp/2026-09-17-transfer-received-prod.ts` does both (read-only);
`apps/api/tmp/2026-09-10-push-diagnosis.ts` answers the broader "is push configured at all".

## Senders

Pushes go out for: admin campaigns and test pushes, `transferReceived` (a Vaquita user paid
you), `onrampSettled` / `offrampSettled`, and `depositReceived` — the USDC behind a "Deposit
from another app" wait (Binance, Meru…) landed in the wallet.

`depositReceived` is decided on the server from Horizon
(`packages/shared/src/services/depositIntents/arrival.ts`): a USDC payment from a configured
issuer into the intent's wallet since the intent opened. It is checked on
`GET /deposit-intents/open`, on the client's `arrived` report, and by the API's deposit intent
watcher (`apps/api/src/lib/depositIntentWatcher.ts`, every `DEPOSIT_INTENT_WATCH_MS`, default
60 s, `0` disables), which is what reaches a user who closed the app. Only the path whose
atomic `status = 'open'` update closed the intent notifies, so several PM2 instances are fine.
Only deposits made while a wait is open notify; a payment sent without opening one does not.

# Deposit from another platform — research (2026-09-23)

The existing funding surfaces (`DepositPanel`, `WalletPage`, `BridgeModal`) and their known
defects are in `CLAUDE.md` → **Funding the wallet (money in)**.

**Research, 2026-09-23 — "deposit from another platform" (Takenos / Meru / Binance / Wallbit).**
Constraints set by the user: non-custodial, crypto rails only, on-chain for everything except
Binance, which was evaluated both ways. Conclusions a resuming agent should not re-derive:

- **Two tiers, and the UI must route on them.** Binance and Meru withdraw USDC natively on
  Stellar → nothing needed but the user's own `G…` address. Takenos (Polygon/BNB/Tron) and
  Wallbit (Polygon/Ethereum/Arbitrum/Base/Solana/Tempo) have **no Stellar rail** → cross-chain
  hop. Binance's USDC/XLM rail: fee 1 USDC, min 2, accepts `^G[A-D]{1}[A-Z2-7]{54}$` only
  (**muxed `M…` rejected**), and there is **no USDT-on-Stellar rail at Binance**.
- **Binance on-chain beats every API/partner path.** Pay Payout is outbound-only and cannot
  address an on-chain destination; Pay C2B settles into a pooled merchant balance (fails the
  non-custodial rule on *custody*); the merchant API needs approved-merchant status plus
  server-side HMAC-SHA512 secret custody; `/sapi/v1/capital/withdraw/apply` runs on the **end
  user's own API key and UID weight budget**, not a partner relationship. Build zero
  Binance-specific code.
- **The blocker is the Stellar receiving precondition, not detection.** The account must exist
  (base reserve) and hold a trustline to the Circle issuer
  `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`, or the withdrawal fails
  `op_no_trust` **on the sender's side**, where we never see it. `useUsdcTrustline` already
  returns `unfunded | missing | ok` and should gate the address screen.
- **Memo is a non-issue inbound — do not build memo matching.** SEP-0029 is opt-in by the
  *receiving* account and enforced client-side only; it matters only outbound (Vaquita → an
  exchange), where `Server.submitTransaction()` checks it but raw Horizon POST and wallet-kit
  submits bypass it.
- **QR encodes the bare `G…` address, not a SEP-7 URI** — centralized platforms do not parse
  `web+stellar:`.
- **Detection = the existing pull-on-read pattern** plus a Horizon cursor reconciler for the
  cold path, with `(transaction_hash, operation_id)` as the natural idempotency key. No
  streaming worker, no event sourcing, no saga. If a reconciler is written, **do not copy the
  existing cursor bug** (see `docs/ops/reconciliation-recovery.md`).

Four decisions still open, all product calls: the refund policy for exchange-origin bridge
deposits (blocks the Takenos/Wallbit half); who funds the base reserve + trustline; whether the
Bridge/Receive tiles stay behind `cryptoSavvy`; and whether Meru's Stellar rail applies to
Bolivian accounts (its Spain entity lists only Tron and Polygon).

# Signup abuse: automated wallets claiming nicknames

Production `profiles` holds rows created by a script, not by users: random
21-character nicknames (`h8rku4mpszhjbjcddndxv`, `s2d4m4pte6cuta7g3dc3m`, …),
`onboarding_completed = false`, `full_name` and `email` NULL. The wallets behind
them are funded Stellar accounts.

They are not ours: the e2e suite prefixes every handle with `e2e_`
(`apps/web/e2e/fixtures.ts:204`) and runs on testnet against friendbot accounts.

The damage is not the junk rows. It is **nickname squatting** — the public
namespace (`/leaderboard/<nickname>`, `/explore/<nickname>`) is finite, each bot
wallet holds exactly one name, and the names are being reserved by someone
else — plus user metrics that count wallets instead of people.

## 1. How the flow is driven without a browser

Three HTTP calls and the Stellar SDK:

```
1. POST /api/v1/auth/challenge  { walletAddress }            → challenge XDR
2. sign the XDR offline with Keypair.fromSecret()            (no wallet, no popup)
3. POST /api/v1/auth/verify     { walletAddress, signedXdr } → JWT, 7 days
4. POST /api/v1/profile/wallet/:addr/nickname { nickname }   → name claimed
```

### The gaps that make it free

| # | Gap | Where |
|---|---|---|
| 1 | The wallet session proves control of a private key, and Stellar keys are free, infinite and signable offline. Horizon is never consulted, so the account does not even have to exist on-chain to receive a JWT. | `apps/api/src/lib/walletAuth.ts`, `apps/api/src/routes/auth/route.ts:14,24` |
| 2 | Profile creation needs no authentication: `getProfile()` is an upsert and every public GET calls it, so an anonymous `curl` inserts a row. | `packages/shared/src/services/profile/index.ts:300`, `apps/api/src/routes/profile/route.ts:52` |
| 3 | No rate limiting anywhere in the API — `cors()` wide open, `express.json()`, nothing else. | `apps/api/src/app-api.ts:25` |
| 4 | `POST /referrals/wallet/:addr/redeem` carries no session and also upserts. A referral only counts as active with a confirmed deposit, so the payout side is safe, but the row-creation side is not. | `apps/api/src/routes/referral/route.ts:34`, `packages/shared/src/services/referral/index.ts:111,160` |

The nickname policy (`apps/api/src/lib/nicknamePolicy.ts`) validates charset,
reserved names and moderation — how the name *looks*, never *who* asks for it.

## 2. Infrastructure constraints

- Vercel serves **DNS only**. There is no edge in front of the origin: the
  Dokploy host IP is public and reachable directly with the right `Host` header.
  Edge WAF and Cloudflare rate limiting are not options.
- Deploys run on **Dokploy**, which ships Traefik as its reverse proxy — that is
  where the network-level layer belongs.
- The API image starts a single Node process (`apps/api/Dockerfile`), so the
  in-memory nonce store in `walletAuth.ts` and an in-memory limiter both work
  today. Both break the moment a second replica exists: per-replica counters and
  a challenge that verifies only on the process that minted it.

## 3. Plan

### Step 1 — Express, no UX change

- [ ] `app.set('trust proxy', 1)` in `apps/api/src/app-api.ts`. Behind Traefik
      `req.ip` is the Docker gateway for every request; without this any per-IP
      limiter treats all traffic as one client and locks everyone out at once.
      This lands **before** the limiter.
- [ ] `express-rate-limit` on `/auth/challenge`, `/auth/verify`,
      `/profile/wallet/:walletAddress/nickname` and
      `/referrals/wallet/:walletAddress/redeem`.
- [ ] Restrict `cors()` to the app origins.
- [ ] `requireWalletSession` on the referral redeem route.

### Step 2 — Traefik, in Dokploy

- [ ] `rateLimit` (`average` / `burst` / `period`) and `inFlightReq` middlewares,
      from the app's Traefik editor or a file in
      `/etc/dokploy/traefik/dynamic/`.
- [ ] A second router with `PathPrefix('/api/v1/auth')` and higher `priority`
      carrying a stricter limit — a middleware otherwise applies to the whole
      router.
- [ ] Confirm the API container does not publish `3100` on `0.0.0.0` and that
      only Traefik reaches it over the internal network; `ufw` allowing 80/443
      only. A published app port bypasses every rule above.

### Step 3 — Make the identity cost something

- [ ] `/auth/verify` checks the account exists on Horizon. Floor: 1 XLM of base
      reserve per bot.
- [ ] Drop the upserts from the read paths. GETs resolve or 404; the row is
      created on `/auth/verify` or on the first authenticated write. Same for
      `getReferralSummary` and `redeemReferralCode`.
- [ ] Verify `WALLET_AUTH_ENFORCE=true` in production. Set to `false`, the
      warn-only branch in `walletAuth.ts` lets mutations through with no token
      at all.

### Step 4 — Friction against automation

- [ ] Proof of work on `/auth/challenge`: [Altcha](https://altcha.org)
      (self-hosted, MIT) or a hashcash of N leading zero bits before the server
      mints a challenge. The attacker is a script, not a human — one real login
      pays ~200 ms once, 500 accounts pay real CPU.
- [ ] Alternative: Cloudflare Turnstile, which is a standalone product — an
      account and a site registration, no DNS move, verified server-side against
      `siteverify`.
- [ ] The web side has a single entry point for both,
      `apps/web/src/networks/stellar/walletSession.ts`.

### Step 5 — Gate the scarce resource

- [ ] The nickname is handed out only after a real action: first confirmed
      deposit, minimum USDC balance / trustline, or account age. The profile may
      exist before that; what it does not get is the public name, and it does not
      appear in explore or the leaderboard.

### Step 6 — Detection and cleanup

- [ ] Sweep rule for what is already in: `nickname IS NOT NULL AND
      onboarding_completed = false`, no deposits, no `legal_acceptances`, created
      in tight bursts → `deleted_at`. The partial unique index frees the nickname
      on soft-delete.
- [ ] Store IP and user-agent plus a `nickname_claimed_at` at claim time, so
      bursts are visible after the fact.
- [ ] Alert on profiles created per hour against deposits per hour.

### If the API scales to more than one replica

- [ ] Redis (Dokploy hosts one) for both the limiter store and the challenge
      nonce store.

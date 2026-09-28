# DNS (`vaquita.fi` on Cloudflare)

The zone moved to Cloudflare (`natasha`/`major.ns.cloudflare.com`) around 2026-09-24; it used to
be a Vercel-managed zone. The move copied only some records, and it **took production down**:
`api.mainnet.production` was created *proxied*, and `db.mainnet.production` was not created at
all. Both are fixed now (`/api/v1/config` → 200 on 2026-09-28).

Two servers carry almost everything: **`5.161.220.67`** (prod: `app`, `api|admin|db.mainnet.production`)
and **`87.99.152.125`** (Dokploy for staging/dev/testnet, `metrics.*`, `umami`, `dokploy-stellar`,
`www`, apex). Every `*.vaquita.fi` name that has no record of its own falls to a proxied wildcard
`*` → Vercel (`64.29.17.1`, `64.29.17.65`), which is where most of the old one-level Vercel
projects (`base`, `op`, `lemon`, `admin`, `miniapp`, …) are served from.

Four rules that are easy to get wrong:

- **Anything two or more levels deep must be DNS only (grey cloud).** Universal SSL covers only
  `vaquita.fi` and `*.vaquita.fi`, so a proxied `api.mainnet.production.vaquita.fi` fails the TLS
  handshake at the edge (`sslv3 alert handshake failure`, "Provisional headers" in DevTools) and
  never reaches the origin. DNS only works because Traefik on each server holds its own Let's
  Encrypt cert. Total TLS (Advanced Certificate Manager, paid) would allow proxying them.
- **A missing record fails silently, not with NXDOMAIN.** The wildcard answers for it, so an HTTP
  name returns Vercel `DEPLOYMENT_NOT_FOUND` and a Postgres name times out. The API reaches its DB
  **by hostname** — prod's `DATABASE_URL` host is `db.mainnet.production.vaquita.fi:5432` — so a
  missing `db.*` record surfaces as `PrismaClientKnownRequestError … ETIMEDOUT` on every DB route
  while `/api/v1/health` (no DB) still says `alive`. Restart the API in Dokploy after fixing DNS.
- **The wildcard stops at an existing name.** Because `app` exists, `dev.app` and `base.app`
  get no answer at all; they need explicit records.
- **Non-HTTP records can never be proxied** — `db.*` (5432), `mail`/`imap`/`pop`/`smtp`, and
  `pm-bounces` (Postmark's return path, must be CNAME `pm.mtasv.net`).

To tell a missing record from a proxied one, query Cloudflare directly and look at the headers:
`dig +short @natasha.ns.cloudflare.com <host>` (Cloudflare IPs `104.21.50.167`/`172.67.164.101`
= proxied or wildcard; a server IP = DNS only), then `curl -sI https://<host>` —
`x-vercel-error: DEPLOYMENT_NOT_FOUND` means the wildcard caught it. `curl --resolve
<host>:443:<server-ip>` tests the origin while bypassing Cloudflare.

**Still outstanding as of 2026-09-28:**

| Record | Problem |
|--------|---------|
| `stellar.dev`, `stellar.stagging`, `www.dev`, `store.dev`, `console.store.dev` | proxied or wildcard at depth ≥ 2 → TLS fails; A `87.99.152.125`, DNS only |
| `umami` | missing (falls to Vercel 404); A `87.99.152.125` |
| `dev.app`, `base.app`, `demo.stellar`, `demo1.stellar`, `dev.stellar` | old Vercel projects; need a DNS-only CNAME to Vercel |
| `20250610224948pm._domainkey`, `s20250130305._domainkey` | DKIM TXT records not copied — outbound mail fails DKIM |
| `mail`, `imap`, `pop`, `smtp`, `pm-bounces`, `status` | proxied; must be DNS only (`status` → CNAME `status.juki.app`, 525 today) |
| `api-service*`, `workadventure` | legacy, missing; origins mostly dead — probably drop |

`stellar.vaquita.fi` now serves the Vercel app (`vaquita-stellar-ui`); the old zone pointed it at
Dokploy (`87.99.152.125`), which also still answers 200. Which one is canonical is undecided.

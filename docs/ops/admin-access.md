# Admin and metrics consoles: who gets in, who may write, and the record of it

Three layers, each enforced in a different place:

| Layer | Decides | Enforced by |
|---|---|---|
| Entry | Which emails may reach the console, with a second factor | Cloudflare Access, in front of `admin.vaquita.fi` and `metrics.vaquita.fi`; the app verifies the Access token on every request |
| Role | Whether an admitted email may write (`operator`) or only look (`read-only`) | `admin_users` table, edited from the console's Users page |
| Record | Who changed what, when, from where | `admin_audit_log` table, one row per admin write |

The API's own admin endpoints stay behind `x-admin-secret`, which only the admin server holds. The
browser never sees it.

## How a request is checked

1. **Cloudflare Access** authenticates the person and adds `Cf-Access-Jwt-Assertion` to the request.
2. **The middleware** (`apps/admin/src/middleware.ts`, `apps/metrics/src/proxy.ts`) verifies that
   token against the team's public keys and the application's AUD tag. No valid token → 403. This
   is what makes the console unreachable by connecting to the server address directly: such a
   request never went through Access and carries no token.
3. **Each route** verifies the token again (`apps/admin/src/lib/adminSecret.ts`), looks up the
   email's role in `admin_users`, and refuses writes from read-only people. Reads accept either role.
4. **Mutation routes** are wrapped with `audited('<area>.<verb>', handler)`
   (`apps/admin/src/lib/audit.ts`): on a 2xx response a row is written with the actor's email, the
   action, the target (`[id]` / `[key]` segment or `?id=`), the validated body with secret-looking
   keys blanked, and the source address.

Scripts and automation call the admin routes with `x-admin-secret` and are recorded as actor
`service`.

## Roles

- `operator` may write. `read-only` may look.
- An email Access admits that has no row is read-only.
- `disabled_at` locks one person out of the app without touching anyone else.
- **Bootstrap:** while `admin_users` is empty, every admitted email is an operator so the first
  person can add themselves and the team from the Users page. The first insert is in the audit log.
- An operator cannot demote or disable themselves; have another operator do it.

## Adding and removing a person

Add: put their email in the Access policy (Cloudflare Zero Trust → Access → Applications → the
console's policy), then on the console's Users page add the email with a role. Until the row
exists they are read-only.

Remove: take the email out of the Access policy (they can no longer reach the console) **and**
disable them on the Users page (if the policy is ever widened they still cannot write). Both steps
are one person each; nobody else is affected and no shared secret changes.

## Environment

Both consoles read:

| Variable | Value |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` (Zero Trust → Settings → Custom pages shows the team name) |
| `CF_ACCESS_AUD` | The Access application's AUD tag (Access → Applications → the app → Overview) |

Set both or neither. With neither, the Access check is skipped and the passcode gate is the only
identity; the audit log then records the actor as `passcode`. That is the rollout state, not the
destination.

## Rollout

1. Apply `20261008_admin_identity.sql` on the environment (`scripts/db-migrate.sh <env> apply …`,
   then `… sql`). The admin app's writes need the tables.
2. Deploy the admin and metrics apps with the passcode still set. Nothing changes for users yet.
3. In Cloudflare: create the Zero Trust team (free up to 50 users), add an identity provider with
   a second factor, create one Access application per console on a **one-level hostname**
   (`admin.vaquita.fi`, `metrics.vaquita.fi`; deeper names cannot be proxied, see `dns.md`), with
   an allow policy listing the team's emails. Note each AUD tag.
4. DNS: explicit proxied records for the two hostnames (the wildcard currently points `admin` at
   an old Vercel project). Add the hostnames to the Dokploy apps.
5. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` on each app and redeploy. From now on the
   console refuses any request without a valid Access token.
6. Open the Users page, add yourself as operator, then the team.
7. Once every environment runs this way, remove the passcode: delete `ADMIN_PASSCODE` /
   `METRICS_PASSCODE`, the login pages and `lib/auth.ts` in a follow-up PR, and drop the old deep
   hostnames from Dokploy and DNS.

## If Cloudflare is down

The consoles are unreachable, by design: there is no other way in. The API and the app are not
behind Access and keep working. For an emergency write, a script with `x-admin-secret` against the
admin server still works from inside the network.

## Checks

- Download a `_next/static` chunk from the console's hostname without signing in → Cloudflare's
  login page, not the file.
- Request the server address directly with the console's `Host` header and no token → 403.
- Remove one email from the policy → they get Cloudflare's denied page; disable them on the Users
  page → 403 from the app. Nobody else notices.
- Change a config value → `admin_audit_log` has a row with your email, `config.update`, the body
  and the time. A read-only person gets 403 on the same write.

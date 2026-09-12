# The product is called "vaquitag" on screen and "vaquitatag" everywhere else

`d936977` renamed the invite code to the username and gave the pair one name.
Which name is not settled: the copy the user reads says **vaquitag**, and the
schema, the migration and the commit that shipped them say **vaquitatag**.

One of the two is a typo, and nobody has said which.

## Where each spelling lives

| Spelling | Where |
| --- | --- |
| `vaquitag` | Every user-visible string: 30 in `en.json`, 32 in `es.json`, 32 in `pt.json`. Also `packages/shared` — `types/commons.ts`, `services/referral`, `services/profile`, `services/campaign`. |
| `vaquitatag` | `apps/supabase/migrations/20260911_vaquitatag.sql` (filename and body), `packages/db/sql/profiles_nickname_format.sql`, `20260825_schema_parity_constraints.sql`, the generated Prisma client, and the commit message that introduced all of it. |

So the split is not random: the screen says one thing and the database says the
other, and the word is a product name the user is meant to say out loud.

## What it costs today

Nothing breaks. The column is `nickname` and the mirror is `referral_code`;
neither spelling is an identifier the code resolves, so the two never meet at
runtime. What it costs is a name the team cannot write the same way twice, in a
feature whose whole point was giving people something they can read across a
table at an event.

## Deciding it

The web E2E specs read this copy from `en.json` rather than repeating it
(`namePrompt` in `apps/web/e2e/fixtures.ts`), so correcting the bundle moves the
specs with it and needs no test change.

If **vaquitatag** wins, the three locale bundles change under
`onboarding.username.*` and everywhere else the word appears — about 94 strings
— plus the `packages/shared` copy. If **vaquitag** wins, the SQL and the Prisma
comments are what change, and the migration filename stays as it is, because
renaming an applied migration is worse than a file whose name reads oddly.

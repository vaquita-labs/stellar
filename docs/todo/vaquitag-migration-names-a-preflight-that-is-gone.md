# The vaquitag migration tells you to run a preflight script the repo does not have

`apps/supabase/migrations/20260911_vaquitag.sql` opens with a warning in bold:

```
-- ⚠️ Antes de correrla contra un entorno, pasar
-- `apps/api/tmp/2026-09-11-vaquitatag-preflight.ts` contra ESE entorno y
-- confirmar los tres ceros...
```

There is no `apps/api/tmp/`. The script was a one-off and went with the branch
that used it, so the instruction cannot be followed.

## Why that is worse than a dead link

The migration's own text explains what the preflight is guarding against:

> Los dos UPDATE de abajo saltean la fila que colisionaría en vez de voltear la
> transacción, así que un hallazgo que no se revisó antes se convierte en una
> fila que quedó sin migrar y en silencio.

The migration **does not fail** on a collision. It skips the row. So a profile
that needed migrating stays behind with no error anywhere, and the only defence
against that was the check nobody can run.

The three counts it asked for, all of which must be zero:

1. Two nicknames that collide once the illegal characters are stripped.
2. A nickname that collides with another profile's `referral_code`.
3. A campaign code equal to a nickname, compared case-insensitively.

## Where it still matters

Not on any environment already migrated — re-running is a no-op by then, as the
header says. It matters the first time this runs somewhere new: a fresh staging
database, a restored backup, a second region.

## What would fix it

Write the three counts as SQL in the migration's own header, so the check lives
with the thing it guards instead of in a file someone can delete. They are three
`SELECT count(*)` against `profiles` and `campaigns`; a reviewer pastes them,
sees three zeros, and runs the migration.

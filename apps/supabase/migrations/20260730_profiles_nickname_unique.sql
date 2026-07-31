-- `nickname` es el segmento público de URL (/leaderboard/<nickname>,
-- /explore/<nickname>) y la clave por la que la tarjeta compartible resuelve un
-- claim, pero la columna no tenía UNIQUE: solo un CHECK de formato y un índice
-- trigram para búsqueda. Sin la constraint, dos perfiles pueden tomar el mismo
-- nickname y cada uno de esos lookups queda ambiguo.
--
-- Parcial a propósito:
--   - `nickname IS NOT NULL` deja convivir los perfiles que todavía no eligieron
--     uno (Postgres ya permite varios NULL bajo un UNIQUE, pero dejarlo
--     explícito documenta la intención).
--   - `deleted_at IS NULL` evita que un perfil borrado siga reservando el
--     nickname y le impida a uno vivo tomarlo.
--
-- ⚠️ Antes de correrla: `packages/db/scripts/diagnose-nicknames.mjs` contra el
-- mismo entorno. Si reporta duplicados, este CREATE INDEX falla y hay que
-- renombrarlos primero.
--
-- Idempotente por IF NOT EXISTS.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_nickname_unique
  ON profiles (nickname)
  WHERE nickname IS NOT NULL AND deleted_at IS NULL;

-- Verificación:
--   SELECT lower(nickname), count(*) FROM profiles
--    WHERE deleted_at IS NULL AND nickname IS NOT NULL
--    GROUP BY lower(nickname) HAVING count(*) > 1;

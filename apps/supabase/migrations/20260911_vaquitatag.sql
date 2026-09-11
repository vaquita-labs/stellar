-- El nickname pasa a ser el código de invitación (el "vaquitatag").
--
-- Hasta ahora cada perfil tenía dos identidades sin relación: el nickname, que
-- el usuario eligió, y un `referral_code` aleatorio de 6 caracteres tipo
-- `FW6A86` que se acuñaba solo la primera vez que abría la pantalla de invitar.
-- Ese código no se puede dictar en una mesa ni escribir de memoria. A partir de
-- acá hay una sola identidad y es la que el usuario ya tiene.
--
-- Cuatro pasos, en este orden, en una sola transacción:
--
--   1. Ensanchar `referral_code`: es varchar(12) y tiene que entrar un nickname
--      viejo de hasta 32. SIN ESTE PASO EL 3 FALLA.
--   2. Sacar de los nicknames todo lo que no sea alfanumérico y bajarlos a
--      minúsculas. El guion bajo deja de ser legal porque el tag se dicta en
--      voz alta y se tipea en un evento.
--   3. Copiar el nickname sobre `referral_code`.
--   4. Endurecer el CHECK de formato a `^[a-z0-9]{3,32}$`.
--
-- El tope de 32 se mantiene en la base a propósito: los nombres largos que ya
-- existen quedan como están (romperle la identidad a alguien para imponer un
-- límite nuevo no vale la pena), y el tope de 15 se aplica solo en la escritura,
-- en `apps/api/src/lib/nicknamePolicy.ts`. Por eso son dos reglas y no una.
--
-- Los perfiles sin nickname conservan su código aleatorio: son anteriores al
-- gate de username y ni siquiera pueden abrir la pantalla de invitar.
--
-- Idempotente: correrla de nuevo no hace nada, porque después de la primera vez
-- ningún nickname tiene caracteres para sacar y ningún código difiere del tag.
--
-- ⚠️ Antes de correrla contra un entorno, pasar
-- `apps/api/tmp/2026-09-11-vaquitatag-preflight.ts` contra ESE entorno y
-- confirmar los tres ceros: ninguna colisión al recortar, ningún nickname que
-- choque con el `referral_code` de otro perfil, y ningún código de campaña
-- igual a un nickname sin distinguir mayúsculas. Los dos UPDATE de abajo
-- saltean la fila que colisionaría en vez de voltear la transacción, así que un
-- hallazgo que no se revisó antes se convierte en una fila que quedó sin migrar
-- y en silencio.

BEGIN;

-- 1. Un nickname de 31 caracteres no entra en varchar(12).
ALTER TABLE "profiles" ALTER COLUMN "referral_code" TYPE varchar(50);

-- 2. El CHECK viejo permite guion bajo, así que se saca antes de tocar datos y
--    se vuelve a poner endurecido en el paso 4. `IF EXISTS` porque
--    20260825_schema_parity_constraints.sql no está aplicada en todos lados.
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_nickname_format";

UPDATE "profiles" p
   SET nickname = lower(regexp_replace(p.nickname, '[^a-zA-Z0-9]', '', 'g')),
       updated_at = NOW()
 WHERE p."deleted_at" IS NULL
   AND p.nickname IS NOT NULL
   AND p.nickname <> lower(regexp_replace(p.nickname, '[^a-zA-Z0-9]', '', 'g'))
   -- Recortar no puede dejar un nombre por debajo del mínimo.
   AND length(lower(regexp_replace(p.nickname, '[^a-zA-Z0-9]', '', 'g'))) >= 3
   -- `profiles_nickname_unique` es parcial (nickname no nulo y no borrado) y
   -- byte a byte, así que la comprobación mira exactamente esas filas.
   AND NOT EXISTS (
     SELECT 1 FROM "profiles" o
      WHERE o.id <> p.id
        AND o."deleted_at" IS NULL
        AND o.nickname = lower(regexp_replace(p.nickname, '[^a-zA-Z0-9]', '', 'g'))
   );

-- 3. El código de invitación pasa a ser el tag.
UPDATE "profiles" p
   SET referral_code = p.nickname,
       updated_at = NOW()
 WHERE p."deleted_at" IS NULL
   AND p.nickname IS NOT NULL
   AND (p.referral_code IS DISTINCT FROM p.nickname)
   -- `profiles_referral_code_unique` es parcial solo sobre NULL: NO excluye los
   -- borrados lógicos, así que un perfil borrado sigue reteniendo su código y
   -- puede bloquear a uno vivo. Por eso este EXISTS mira toda la tabla.
   AND NOT EXISTS (
     SELECT 1 FROM "profiles" o
      WHERE o.id <> p.id
        AND o.referral_code = p.nickname
   );

-- 4. El formato nuevo: sin guion bajo. El tope sigue en 32 por los nombres
--    viejos; los nuevos los corta la API en 15.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_nickname_format"
  CHECK (nickname IS NULL OR nickname ~ '^[a-z0-9]{3,32}$');

COMMIT;

-- Verificación (las tres primeras deberían devolver 0):
--   SELECT count(*) FROM profiles
--    WHERE deleted_at IS NULL AND nickname IS NOT NULL
--      AND nickname !~ '^[a-z0-9]{3,32}$';
--   SELECT count(*) FROM profiles
--    WHERE deleted_at IS NULL AND nickname IS NOT NULL
--      AND referral_code IS DISTINCT FROM nickname;
--   SELECT count(*) FROM profiles p JOIN profiles o ON o.id <> p.id
--      AND o.referral_code = p.referral_code WHERE p.referral_code IS NOT NULL;
--
-- Y la columna ensanchada:
--   SELECT character_maximum_length FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'profiles'
--      AND column_name = 'referral_code';  -- 50

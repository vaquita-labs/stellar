-- Normaliza las keys de badges a guion bajo.
--
-- El código resuelve badges por key: i18n busca `achievements.items.<key>`, el
-- chequeo de podio compara contra `first_place`/`second_place`/`third_place`, y
-- `badge_claims.badge_type` guarda esa misma key. Todo eso asume guion bajo,
-- que es lo que usa el catálogo de producción. Un entorno sembrado con las
-- migraciones viejas quedó con guion medio y falla en silencio en cada lookup.
--
-- Idempotente: correrla de nuevo no hace nada, porque después de la primera vez
-- ya no queda ninguna key con guion.
--
-- ⚠️ Antes de correr esto, pasar `packages/db/scripts/diagnose-badge-keys.mjs`
-- contra el mismo entorno. Si reporta una COLISIÓN, el UPDATE de abajo saltea
-- esa fila a propósito (el índice UNIQUE la rechazaría) y hay que decidir a
-- mano qué hacer con las dos filas antes de seguir.

BEGIN;

-- Las dos tablas se mueven juntas o los vouchers y los mints dejan de matchear
-- su badge.

UPDATE achievements a
   SET key = replace(a.key, '-', '_'),
       updated_at = NOW()
 WHERE a.key LIKE '%-%'
   -- El UNIQUE sobre `key` incluye las filas borradas lógicamente, así que la
   -- comprobación mira toda la tabla, no solo las vivas.
   AND NOT EXISTS (
     SELECT 1 FROM achievements o WHERE o.key = replace(a.key, '-', '_')
   );

-- Los badge_type que no salen de `achievements` (los del catálogo on-chain:
-- primera_vaquita, genesis_saver, …) ya vienen con guion bajo, así que el LIKE
-- no los toca.
UPDATE badge_claims
   SET badge_type = replace(badge_type, '-', '_')
 WHERE badge_type LIKE '%-%';

COMMIT;

-- Verificación (debería devolver 0 en las dos):
--   SELECT count(*) FROM achievements WHERE key LIKE '%-%';
--   SELECT count(*) FROM badge_claims WHERE badge_type LIKE '%-%';
--
-- Y ningún claim huérfano:
--   SELECT bc.badge_type, count(*)
--     FROM badge_claims bc
--     LEFT JOIN achievements a ON a.key = bc.badge_type
--    WHERE a.key IS NULL
--    GROUP BY bc.badge_type;

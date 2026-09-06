-- Moderación de los reportes de `feedback_posts` antes de que sean públicos.
--
-- El board salió sin ninguna revisión: `listFeedbackBoard` sólo filtraba por
-- `deleted_at IS NULL` y `status <> 'closed'`, así que cualquiera con wallet
-- podía poner el texto y la imagen que quisiera delante del resto de los
-- usuarios en el momento en que la fila se commiteaba.
--
-- `moderation_status` es una columna aparte y no un valor más de `status` a
-- propósito. `status` es el ciclo de triage (open → planned → done) y ya está
-- sobrecargado como flag de visibilidad vía `<> 'closed'`; meter la revisión
-- ahí haría que "esperando revisión" y "no lo vamos a hacer" sean el mismo
-- estado, y son cosas distintas que decide gente distinta.
--
-- Los cuatro valores:
--   pending   la revisión no se pudo completar (sin API key, 429, timeout,
--             respuesta rara). NO es público: la consigna es que lo que falla
--             el chequeo tampoco se muestra.
--   approved  el modelo no marcó nada, o un admin lo aprobó a mano.
--   flagged   el modelo lo marcó. No es público hasta que un admin lo revise.
--   rejected  un admin lo bajó. No vuelve solo.
--
-- El default es 'pending' —fail-closed— pero las filas que ya existían se
-- backfillean a 'approved': ya eran públicas, y hacerlas desaparecer del board
-- en el deploy sería un cambio de datos encubierto. Se re-moderan después con
-- apps/api/tmp/2026-09-06-remoderate-existing.ts.
--
-- `moderation_result` guarda las categorías y los scores que devolvió el
-- modelo, o `{"error": "..."}` cuando no hubo veredicto. Es lo que el admin
-- lee para decidir; sin eso, "flagged" es una palabra sin argumento.

ALTER TABLE "feedback_posts"
  ADD COLUMN IF NOT EXISTS "moderation_status" varchar(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "moderation_result" jsonb,
  ADD COLUMN IF NOT EXISTS "moderated_at"      timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_posts_moderation_status_check'
  ) THEN
    ALTER TABLE "feedback_posts"
      ADD CONSTRAINT "feedback_posts_moderation_status_check"
      CHECK (moderation_status = ANY (ARRAY['pending', 'approved', 'flagged', 'rejected']));
  END IF;
END $$;

-- Backfill de lo que ya estaba publicado. `moderated_at IS NULL` es lo que
-- distingue "nunca pasó por el gate" de cualquier fila posterior, así que
-- correr esto dos veces no re-aprueba nada que un admin haya bajado.
UPDATE "feedback_posts"
   SET "moderation_status" = 'approved'
 WHERE "moderated_at" IS NULL
   AND "moderation_status" = 'pending';

-- El board ahora filtra por moderación además de por tipo, y sigue ordenando
-- por votos. Reemplaza a idx_feedback_posts_board como índice del orden por
-- defecto; el viejo se deja porque el admin todavía filtra sin moderación.
CREATE INDEX IF NOT EXISTS idx_feedback_posts_public
  ON "feedback_posts" ("kind", "moderation_status", "vote_count" DESC, "created_at" DESC);

-- La cola de revisión del admin: pending y flagged, lo más nuevo primero.
CREATE INDEX IF NOT EXISTS idx_feedback_posts_moderation
  ON "feedback_posts" ("moderation_status", "created_at" DESC);

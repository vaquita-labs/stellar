-- Notas de versión: lo que le contamos al usuario cuando sale una función nueva.
--
-- Tres decisiones que vale la pena dejar escritas:
--
-- 1) La tabla guarda TODAS las notas, pero el usuario solo ve la última. El
--    historial no es para él: es para que el equipo pueda releer qué se anunció
--    y cuándo, y para poder despublicar sin perder el texto.
--
-- 2) El acuse va como una sola columna en `profiles` (`release_note_seen_id`) y
--    no como tabla puente. Con "solo ve la última", un id monótono responde la
--    única pregunta que hacemos —¿hay algo más nuevo que lo que ya vio?— con un
--    entero y una escritura. Una tabla puente guardaría lecturas de notas que
--    nunca se muestran.
--
-- 3) Las imágenes van en `bytea`, igual que `feedback_attachments`: el proyecto
--    no tiene bucket de Storage y toda la persistencia pasa por Prisma. Las sube
--    un admin autenticado, ya reescaladas en el cliente, así que el volumen es
--    de unas pocas por release.
--
-- `published_at NULL` es el borrador. Es el único estado: una nota o está
-- publicada (y entonces compite por ser la última) o no existe para el usuario.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "release_notes" (
  "id"           serial PRIMARY KEY,
  "title"        varchar(160) NOT NULL,
  "body"         text         NOT NULL,
  -- NULL = borrador. Solo las publicadas se le muestran a alguien.
  "published_at" timestamptz,
  "created_at"   timestamptz  NOT NULL DEFAULT now(),
  "updated_at"   timestamptz  NOT NULL DEFAULT now(),
  "deleted_at"   timestamptz,
  CONSTRAINT release_notes_title_check CHECK (length(btrim("title")) > 0)
);

-- "la última publicada" es LA consulta de esta tabla, en cada arranque de sesión.
CREATE INDEX IF NOT EXISTS idx_release_notes_published
  ON "release_notes" ("published_at" DESC)
  WHERE "published_at" IS NOT NULL AND "deleted_at" IS NULL;

CREATE TABLE IF NOT EXISTS "release_note_images" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "release_note_id" integer     NOT NULL REFERENCES "release_notes" ("id") ON DELETE CASCADE,
  "content_type"    varchar(40) NOT NULL,
  "byte_size"       integer     NOT NULL,
  "data"            bytea       NOT NULL,
  -- Orden del carrusel. Empatan por created_at, que es estable.
  "display_order"   integer     NOT NULL DEFAULT 0,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT release_note_images_type_check
    CHECK ("content_type" IN ('image/png', 'image/jpeg', 'image/webp')),
  -- 2 MB por imagen, igual que los adjuntos del feedback. El tope real lo
  -- aplica el handler; esto es la red para cualquier otro escritor.
  CONSTRAINT release_note_images_size_check CHECK ("byte_size" > 0 AND "byte_size" <= 2097152)
);

CREATE INDEX IF NOT EXISTS idx_release_note_images_note
  ON "release_note_images" ("release_note_id", "display_order");

-- El acuse. NULL = nunca vio ninguna, que es lo correcto para las cuentas que ya
-- existen: la próxima nota publicada les aparece.
ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "release_note_seen_id" integer;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "release_notes", "release_note_images" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "release_notes", "release_note_images" TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "release_notes", "release_note_images" TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "release_notes", "release_note_images" TO supabase_admin;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE, SELECT ON SEQUENCE "release_notes_id_seq" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE, SELECT ON SEQUENCE "release_notes_id_seq" TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE, SELECT ON SEQUENCE "release_notes_id_seq" TO service_role;
  END IF;
END $$;

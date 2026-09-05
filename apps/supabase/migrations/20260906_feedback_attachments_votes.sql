-- Adjuntos y votos para los reportes de `feedback_posts`.
--
-- Dos cosas que en la v1 quedaron afuera y ahora sí van:
--
-- 1) El clip del diseño de referencia. No hay bucket de Storage en el proyecto
--    —toda la persistencia pasa por Prisma sobre Postgres— así que la imagen se
--    guarda en `bytea`. Es una decisión consciente: el cliente reescala a 1280px
--    y recomprime antes de subir, el servidor corta en 3 adjuntos de 2 MB, y a
--    ese tamaño la tabla no justifica montar un subsistema de subidas firmadas.
--    Si algún día el volumen lo pide, migrar a Storage es mover los bytes: el
--    resto del modelo no cambia.
--
-- 2) El voto estilo Canny. `feedback_votes` tiene único (post_id, profile_id)
--    porque el toggle del cliente puede llegar dos veces —doble tap, reintento
--    de red— y la unicidad es lo que hace que eso no sume dos.
--
-- `vote_count` va desnormalizado en `feedback_posts` a propósito: el orden por
-- defecto del board es por votos, y ordenar por un agregado sobre el join no se
-- puede indexar. Se actualiza en la misma transacción que el voto.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "feedback_attachments" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id"      uuid        NOT NULL REFERENCES "feedback_posts" ("id") ON DELETE CASCADE,
  "content_type" varchar(40) NOT NULL,
  "byte_size"    integer     NOT NULL,
  "data"         bytea       NOT NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_attachments_type_check
    CHECK ("content_type" IN ('image/png', 'image/jpeg', 'image/webp')),
  -- 2 MB por adjunto. El tope real lo aplica el handler; esto es la red de
  -- seguridad para cualquier otra cosa que escriba en la tabla.
  CONSTRAINT feedback_attachments_size_check CHECK ("byte_size" > 0 AND "byte_size" <= 2097152)
);

CREATE INDEX IF NOT EXISTS idx_feedback_attachments_post
  ON "feedback_attachments" ("post_id");

CREATE TABLE IF NOT EXISTS "feedback_votes" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id"    uuid        NOT NULL REFERENCES "feedback_posts" ("id") ON DELETE CASCADE,
  "profile_id" integer     NOT NULL REFERENCES "profiles" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_votes_post_profile_unique UNIQUE ("post_id", "profile_id")
);

CREATE INDEX IF NOT EXISTS idx_feedback_votes_profile
  ON "feedback_votes" ("profile_id");

ALTER TABLE "feedback_posts"
  ADD COLUMN IF NOT EXISTS "vote_count" integer NOT NULL DEFAULT 0;

-- El board: un tipo, ordenado por votos. Sin este índice el orden por defecto
-- es un sort completo de la tabla.
CREATE INDEX IF NOT EXISTS idx_feedback_posts_board
  ON "feedback_posts" ("kind", "vote_count" DESC, "created_at" DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "feedback_attachments", "feedback_votes" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "feedback_attachments", "feedback_votes" TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "feedback_attachments", "feedback_votes" TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "feedback_attachments", "feedback_votes" TO supabase_admin;
  END IF;
END $$;

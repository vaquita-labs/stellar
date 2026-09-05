-- Campañas de marketing y atribución de primer toque.
--
-- El sistema de referidos existía sólo en el papel: se generaba el código, había
-- endpoint de canje y bonus por tramos, pero NADA escribía
-- `profiles.referred_by_id` —ningún cliente leía `?ref=` de la URL y el endpoint
-- de canje no tenía llamadores—. El KPI "Referidos" del dashboard de métricas
-- leía una columna que nadie llenaba. Esta migración agrega la otra mitad: de
-- dónde vino cada usuario.
--
-- `campaigns.code` vive en un namespace distinto del de `profiles.referral_code`
-- (6 chars, alfabeto sin ambigüedades): la resolución del código prueba primero
-- campaña y después referido, así que un choque haría que la campaña se coma un
-- código de usuario. Se valida al crear, no acá — un CHECK no puede mirar la
-- otra tabla.
--
-- En `profiles` son DOS columnas y no una: `campaign_id` es la campaña resuelta
-- (lo que se agrupa y se cuenta), `attribution` es el blob crudo de UTMs +
-- referrer + el momento del aterrizaje. Guardar el crudo aparte es lo que
-- permite responder preguntas que hoy no sabemos que vamos a hacer sin haber
-- perdido el dato. Es jsonb por el mismo motivo que `notification_preferences`:
-- seis columnas más de UTM no le sirven a ningún índice.
--
-- Las dos se escriben UNA vez y nunca se pisan (misma regla que
-- `referred_by_id`): primer toque gana, para que una visita orgánica posterior
-- no le robe la conversión a la campaña que realmente la trajo.
CREATE TABLE IF NOT EXISTS "campaigns" (
  "id"           serial PRIMARY KEY,
  "code"         varchar(32)  NOT NULL,
  "name"         varchar(120) NOT NULL,
  -- Los UTM por defecto del link que arma el panel de admin. Son sugerencias
  -- para construir la URL, no un filtro: lo que llega en la query string se
  -- guarda igual en `profiles.attribution`.
  "source"       varchar(60),
  "medium"       varchar(60),
  "content"      varchar(120),
  "landing_path" varchar(200),
  "starts_at"    timestamptz,
  "ends_at"      timestamptz,
  "is_active"    boolean      NOT NULL DEFAULT true,
  "notes"        text,
  "created_at"   timestamptz  NOT NULL DEFAULT now(),
  "updated_at"   timestamptz  NOT NULL DEFAULT now(),
  "deleted_at"   timestamptz
);

-- El código se busca en cada aterrizaje atribuido, siempre en mayúsculas. El
-- índice es parcial porque borrar una campaña (soft delete) tiene que liberar
-- el código para reusarlo en la próxima.
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_code_unique
  ON "campaigns" ("code")
  WHERE "deleted_at" IS NULL;

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "campaign_id" integer REFERENCES "campaigns" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "attribution" jsonb;

-- El dashboard de campañas agrupa por campaña y ordena por alta. Sin WHERE a
-- propósito: un índice parcial no-único es de las cosas que `prisma db push`
-- tira y hay que reponer a mano desde packages/db/sql/, y las filas sin campaña
-- que se cuela indexar no justifican esa deuda.
CREATE INDEX IF NOT EXISTS idx_profiles_campaign_created
  ON "profiles" ("campaign_id", "created_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "campaigns" TO anon;
    GRANT USAGE, SELECT ON SEQUENCE "campaigns_id_seq" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "campaigns" TO authenticated;
    GRANT USAGE, SELECT ON SEQUENCE "campaigns_id_seq" TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "campaigns" TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE "campaigns_id_seq" TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "campaigns" TO supabase_admin;
    GRANT USAGE, SELECT ON SEQUENCE "campaigns_id_seq" TO supabase_admin;
  END IF;
END $$;

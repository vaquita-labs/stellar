-- Feedback y reportes de bug mandados desde adentro de la app.
--
-- Hasta ahora no había forma de contarnos nada sin salir de Vaquita: Ajustes →
-- Soporte ofrecía un "Centro de ayuda" que apuntaba al sitio y un "Feedback"
-- deshabilitado con cartel de "pronto", y el formulario que ya existía en
-- `/profile/feedback` resolvía con un setTimeout —nunca mandó nada a ningún
-- lado—. Los dos accesos se mudan al Concierge, que es la pantalla donde el
-- usuario ya viene a hablar con el equipo.
--
-- `kind` separa bug de feedback porque se triagean distinto, no porque cambie
-- el formulario: los dos son título + detalle. `status` es el ciclo de vida que
-- mueve el admin a mano.
--
-- `locale`, `user_agent` y `app_path` los completa el servidor, no el usuario:
-- son el reemplazo barato de la captura de pantalla (el clip del diseño quedó
-- para después). `app_path` es la ruta de la app desde donde se abrió el
-- formulario, no una URL completa — no queremos query strings acá.
--
-- `wallet_address` va desnormalizada a propósito, igual que en
-- `legal_acceptances`: si el perfil se borra, el reporte tiene que sobrevivir
-- para poder cerrarlo o responderlo.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "feedback_posts" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id"     integer      REFERENCES "profiles" ("id") ON DELETE SET NULL,
  "wallet_address" varchar(64)  NOT NULL,
  "kind"           varchar(10)  NOT NULL,
  "title"          varchar(120) NOT NULL,
  "details"        text         NOT NULL DEFAULT '',
  "status"         varchar(20)  NOT NULL DEFAULT 'open',
  "locale"         varchar(8),
  "user_agent"     text,
  "app_path"       varchar(200),
  "created_at"     timestamptz  NOT NULL DEFAULT now(),
  "updated_at"     timestamptz  NOT NULL DEFAULT now(),
  "deleted_at"     timestamptz,
  CONSTRAINT feedback_posts_kind_check CHECK ("kind" IN ('bug', 'feedback')),
  CONSTRAINT feedback_posts_status_check
    CHECK ("status" IN ('open', 'planned', 'in_progress', 'done', 'closed'))
);

-- La consulta del panel de admin: la bandeja de un tipo y un estado, lo más
-- nuevo arriba.
CREATE INDEX IF NOT EXISTS idx_feedback_posts_triage
  ON "feedback_posts" ("kind", "status", "created_at" DESC);

-- El anti-spam del POST cuenta los reportes recientes de un perfil.
CREATE INDEX IF NOT EXISTS idx_feedback_posts_profile_created
  ON "feedback_posts" ("profile_id", "created_at" DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "feedback_posts" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "feedback_posts" TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "feedback_posts" TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "feedback_posts" TO supabase_admin;
  END IF;
END $$;

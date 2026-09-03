-- Cuentas bancarias guardadas para retirar a moneda local.
--
-- El espejo de `saved_wallets` del otro lado del retiro: ahí el usuario guarda
-- una dirección y la vuelve a elegir; acá, hasta ahora, retecleaba cada vez el
-- documento, el banco y el número de cuenta —y un dígito mal en ese formulario
-- manda la plata a otro lado.
--
-- Qué campos pide el formulario NO lo decide esta tabla: lo decide la cotización
-- de Pollar (`quote.requiredFields`), que cambia por país, rail y proveedor. Por
-- eso los valores van en un jsonb y no en columnas: agregar un corredor no puede
-- implicar una migración. Lo que sí queda en columnas es lo que se necesita para
-- FILTRAR ("¿qué cuentas sirven para este corredor?"): país, moneda y rail.
--
-- OJO, esto es dato personal. Adentro del jsonb viven nombre completo, documento
-- de identidad, mail y número de cuenta de una persona real. La tabla existe
-- porque el usuario pidió no retipearlos, no porque los necesitemos: nada del
-- backend los lee salvo para devolvérselos a su propio dueño. Se guardan tal
-- cual los tecleó —sin cifrar en la aplicación—, así que el borrado es blando
-- pero real y el acceso sale SIEMPRE del token de sesión, nunca de la URL.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "saved_bank_accounts" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" integer      NOT NULL REFERENCES "profiles" ("id") ON DELETE CASCADE,
  -- Nombre que le puso el usuario ("Mi cuenta del Banco Unión").
  "label"      varchar(60)  NOT NULL,
  "country"    char(2)      NOT NULL,
  "currency"   varchar(8)   NOT NULL,
  -- El rail de la cotización con la que se guardó (ACH, PIX, BREB…). Puede
  -- faltar si el proveedor no lo publica; en ese caso la cuenta sirve para
  -- cualquier rail del país.
  "rail"       varchar(16),
  -- `{ [field.key]: value }`, exactamente lo que espera `createOfframp`.
  "fields"     jsonb        NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz  NOT NULL DEFAULT now(),
  "updated_at" timestamptz  NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

-- Dos cuentas con el mismo nombre en el mismo corredor son un error de tipeo,
-- no dos cuentas. Parcial por `deleted_at` para que borrar y volver a guardar
-- con el mismo nombre funcione.
CREATE UNIQUE INDEX IF NOT EXISTS saved_bank_accounts_unique_label
  ON "saved_bank_accounts" ("profile_id", "country", "label")
  WHERE "deleted_at" IS NULL;

-- La consulta caliente: las cuentas de este perfil al abrir el paso de datos.
CREATE INDEX IF NOT EXISTS idx_saved_bank_accounts_profile_id
  ON "saved_bank_accounts" ("profile_id");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "saved_bank_accounts" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "saved_bank_accounts" TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "saved_bank_accounts" TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "saved_bank_accounts" TO supabase_admin;
  END IF;
END $$;

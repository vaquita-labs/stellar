-- Compras de USDC con moneda local (on-ramp), para poder retomarlas.
--
-- La API de ramps NO tiene endpoint de listado: toda lectura va por el id de
-- transacción que devuelve la creación. Si ese id se pierde, la compra en curso
-- queda irrecuperable desde el cliente — y el usuario ya pagó. Guardarlo sólo en
-- el navegador no alcanza: es de un solo dispositivo y lo borra exactamente la
-- misma limpieza de storage que hoy tira las sesiones en Safari móvil.
--
-- La forma sale de `bridge_transfers`, que resuelve el mismo problema (una
-- operación externa en curso que hay que poder retomar).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "onramp_purchases" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "wallet_address" varchar(128) NOT NULL,
  "provider_tx_id" varchar(128) NOT NULL,
  "provider"       varchar(64)  NOT NULL,
  "country"        char(2)      NOT NULL,
  "amount_fiat"    varchar(80)  NOT NULL,
  "currency"       varchar(8)   NOT NULL,
  "status"         varchar(32)  NOT NULL DEFAULT 'pending',
  "expires_at"     timestamptz,
  "last_polled_at" timestamptz,
  "error_reason"   text,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  "deleted_at"     timestamptz
);

-- El id del proveedor es el único handle que existe sobre una compra, así que
-- registrarlo dos veces sería perder una de las dos.
CREATE UNIQUE INDEX IF NOT EXISTS onramp_purchases_provider_tx_unique
  ON "onramp_purchases" ("provider", "provider_tx_id")
  WHERE "deleted_at" IS NULL;

-- La consulta caliente: "¿esta wallet tiene algo sin terminar?", en cada
-- apertura del modal.
CREATE INDEX IF NOT EXISTS idx_onramp_purchases_wallet_pending
  ON "onramp_purchases" ("wallet_address", "updated_at")
  WHERE "status" IN ('pending', 'paid') AND "deleted_at" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "onramp_purchases" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "onramp_purchases" TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "onramp_purchases" TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "onramp_purchases" TO supabase_admin;
  END IF;
END $$;

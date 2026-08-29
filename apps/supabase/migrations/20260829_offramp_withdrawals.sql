-- Retiros a moneda local (off-ramp), para saber dónde quedaron cuando fallan.
--
-- Es el espejo de `onramp_purchases` y existe por la misma razón de fondo: la
-- API de ramps no tiene endpoint de listado, así que el id de transacción que
-- devuelve la creación es el único handle sobre un retiro en curso.
--
-- Pero el off-ramp tiene un agujero que la compra no tiene. El USDC sale del
-- vault en el PRIMER paso, antes de que exista ningún registro del lado del
-- proveedor: si el retiro se cae entre el vault y la rampa, la plata se movió y
-- el único rastro es una transacción en Horizon que nadie mira. Por eso la fila
-- se abre ANTES de sacar del vault, con `provider_tx_id` todavía en NULL, y se
-- va completando a medida que cada paso pasa. Una fila que nunca llegó a tener
-- id de proveedor es justamente la más interesante de la tabla.
--
-- OJO: esto lo reporta el cliente ("llegué hasta el paso X"), igual que
-- `onramp_purchases`. Sirve para soporte y observabilidad, NO es un libro
-- contable: para eso haría falta reconciliar contra Horizon, como hace
-- `apps/reconciler` con los depósitos del pool.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "offramp_withdrawals" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "wallet_address"      varchar(128) NOT NULL,
  -- Nulos hasta que `createOfframp` responde (paso 2). Que falten es
  -- información, no un dato incompleto: el retiro no llegó a existir para el
  -- proveedor.
  "provider_tx_id"      varchar(128),
  "provider"            varchar(64),
  "country"             char(2)      NOT NULL,
  "rail"                varchar(16),
  "amount_fiat"         varchar(80)  NOT NULL,
  "currency"            varchar(8)   NOT NULL,
  -- Lo que se sacó del vault, en USDC. Es la plata que puede quedar colgada.
  "usdc_amount"         varchar(80),
  -- Acuses de cada tramo: el del vault (paso 1) y el del pago a la rampa (4).
  "vault_withdraw_hash" varchar(80),
  "payment_hash"        varchar(80),
  -- Hasta dónde llegó: funds | create | payout. Mismos nombres que el stepper
  -- del modal, así "dónde se murió" es una columna y no una deducción.
  "step"                varchar(16)  NOT NULL DEFAULT 'funds',
  -- pending | settled | failed | abandoned
  "status"              varchar(32)  NOT NULL DEFAULT 'pending',
  "error_reason"        text,
  "last_polled_at"      timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  "deleted_at"          timestamptz
);

-- El id del proveedor es el único handle sobre un retiro ya creado, así que
-- registrarlo dos veces sería perder uno de los dos. Parcial: las filas que
-- todavía no llegaron al proveedor lo tienen en NULL y no compiten entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS offramp_withdrawals_provider_tx_unique
  ON "offramp_withdrawals" ("provider", "provider_tx_id")
  WHERE "provider_tx_id" IS NOT NULL AND "deleted_at" IS NULL;

-- La consulta caliente: "¿esta wallet tiene algo sin terminar?", en cada
-- apertura del modal.
CREATE INDEX IF NOT EXISTS idx_offramp_withdrawals_wallet_pending
  ON "offramp_withdrawals" ("wallet_address", "updated_at")
  WHERE "status" = 'pending' AND "deleted_at" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "offramp_withdrawals" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "offramp_withdrawals" TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "offramp_withdrawals" TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "offramp_withdrawals" TO supabase_admin;
  END IF;
END $$;

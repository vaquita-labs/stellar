-- El puente pasa de CCTP propio a NEAR Intents 1Click.
--
-- La tabla se remodela en vez de tirarse. Las filas viejas son el historial real
-- de transferencias de usuarios y `apps/metrics` las agrupa por estado; borrarlas
-- para ahorrar seis columnas sería cambiar datos por prolijidad.
--
-- Qué se va: todo lo que existía solo porque nosotros ejecutábamos el puente.
-- `message_hash` / `cctp_message` / `cctp_attestation` eran el protocolo de Circle;
-- `retry_count` / `last_polled_at` / `processing_lease_until` eran la cola de
-- `apps/bridge-worker`, que ya no existe: 1Click responde el estado por HTTP y lo
-- consultamos al leer, no en un proceso aparte.
--
-- Qué llega: la dirección de depósito que 1Click devuelve (con `deposit_memo`
-- cuando el origen es Stellar, que es como esa red identifica al destinatario) y
-- `quote`, la respuesta firmada completa. La firma se guarda porque es lo único
-- con lo que se puede reclamar si el swap no liquida como fue cotizado.

ALTER TABLE "bridge_transfers" DROP COLUMN IF EXISTS "message_hash";
ALTER TABLE "bridge_transfers" DROP COLUMN IF EXISTS "cctp_message";
ALTER TABLE "bridge_transfers" DROP COLUMN IF EXISTS "cctp_attestation";
ALTER TABLE "bridge_transfers" DROP COLUMN IF EXISTS "retry_count";
ALTER TABLE "bridge_transfers" DROP COLUMN IF EXISTS "last_polled_at";
ALTER TABLE "bridge_transfers" DROP COLUMN IF EXISTS "processing_lease_until";

-- Índice de la cola del worker borrado: referenciaba processing_lease_until y
-- estados que ya no se escriben.
DROP INDEX IF EXISTS idx_bridge_transfers_worker_queue;

ALTER TABLE "bridge_transfers"
  ADD COLUMN IF NOT EXISTS "deposit_address" varchar(128),
  -- Solo con origen Stellar (depositMode = MEMO). Sin él el depósito llega pero
  -- 1Click no sabe a qué swap pertenece.
  ADD COLUMN IF NOT EXISTS "deposit_memo"    varchar(64),
  ADD COLUMN IF NOT EXISTS "correlation_id"  varchar(64),
  ADD COLUMN IF NOT EXISTS "amount_out"      varchar(80),
  ADD COLUMN IF NOT EXISTS "deadline"        timestamptz,
  -- QuoteResponse completo, firma incluida.
  ADD COLUMN IF NOT EXISTS "quote"           jsonb;

-- Por dirección de depósito se consulta el estado; es la clave que usa 1Click.
CREATE INDEX IF NOT EXISTS idx_bridge_transfers_deposit_address
  ON "bridge_transfers" ("deposit_address")
  WHERE "deposit_address" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "bridge_transfers" TO anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "bridge_transfers" TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "bridge_transfers" TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "bridge_transfers" TO supabase_admin;
  END IF;
END $$;

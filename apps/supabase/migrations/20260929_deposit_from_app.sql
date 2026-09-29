-- "Deposit from another app": the platform catalog and the pending-deposit row.
--
-- A user whose dollars sit in Binance, Meru, Takenos or Wallbit gets a guided
-- path from that app into their Vaquita wallet. Two pieces of state back it.
--
-- 1. `config.deposit_platforms` — the catalog. Which apps are offered, in what
--    order, on which network and asset, what each app charges and where its own
--    help pages live. On the singleton `config` row, like `currencies` and
--    `languages`, so a platform can be switched off (or a fee corrected) without
--    a frontend deploy. The tutorial copy itself stays in the i18n bundles: it
--    is prose, and it has to exist in three languages.
--
--    `tier` is what the UI routes on. 'direct' platforms withdraw USDC natively
--    on Stellar, so the user only needs their own G… address. 'bridge' platforms
--    have no Stellar rail and go through the 1Click bridge (USDT on Polygon →
--    USDC on Stellar); those two ship disabled until the bridge accepts Polygon.
--
-- 2. `deposit_intents` — "the user said they are sending money from X". It is a
--    UI marker and nothing else: it never moves money, never credits anything,
--    and a wrong status costs a card on the home screen. It exists so the
--    "waiting for your Binance deposit" card survives a reload, a closed tab and
--    a second device, which the browser alone cannot promise.
--
--    Arrival is detected the way the Receive sheet already does it (the wallet's
--    USDC balance goes up), so a client-reported 'arrived' is acceptable here in
--    a way it would not be on a ledger table. An intent nobody closes expires
--    after 24 h, when `expires_at` passes.

ALTER TABLE config
  ADD COLUMN IF NOT EXISTS deposit_platforms jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN config.deposit_platforms IS
  'Catalog for "Deposit from another app": [{id,name,tier,network,asset,fee,minAmount,appUrl,helpLinks:[{id,url}],enabled,order}]. Tutorial copy lives in the web i18n bundles keyed by id.';

-- Seed only an untouched column, so re-running never overwrites an admin edit.
UPDATE config
   SET deposit_platforms = '[
     {"id":"binance","name":"Binance","tier":"direct","network":"stellar","asset":"USDC",
      "fee":"1 USDC","minAmount":2,"appUrl":"https://www.binance.com/en",
      "helpLinks":[
        {"id":"withdraw","url":"https://www.binance.com/en/support/faq/how-to-withdraw-crypto-from-binance-115003670492"},
        {"id":"stellarUsdc","url":"https://www.binance.com/en/support/announcement/binance-completes-the-integration-of-usd-coin-usdc-on-stellar-network-opens-deposits-and-withdrawals-a5d9a47c65d0453e8740ffc8e455a8e7"}
      ],"enabled":true,"order":1},
     {"id":"meru","name":"Meru","tier":"direct","network":"stellar","asset":"USDC",
      "fee":"1% + 1 USD","minAmount":null,"appUrl":"https://getmeru.com",
      "helpLinks":[
        {"id":"fees","url":"https://getmeru.com/fees/"},
        {"id":"app","url":"https://getmeru.com"}
      ],"enabled":true,"order":2},
     {"id":"takenos","name":"Takenos","tier":"bridge","network":"polygon","asset":"USDT",
      "fee":null,"minAmount":null,"appUrl":"https://takenos.com",
      "helpLinks":[
        {"id":"sendUsdt","url":"https://help.takenos.com/en/articles/9714067-como-puedo-enviar-usdt-desde-takenos-a-mi-billetera-cripto"}
      ],"enabled":false,"order":3},
     {"id":"wallbit","name":"Wallbit","tier":"bridge","network":"polygon","asset":"USDT",
      "fee":null,"minAmount":null,"appUrl":"https://wallbit.io",
      "helpLinks":[
        {"id":"sendUsdt","url":"https://help.wallbit.io/es/articles/11328049-enviar-y-recibir-usdc-y-usdt-con-tu-cuenta-wallbit"}
      ],"enabled":false,"order":4}
   ]'::jsonb
 WHERE deposit_platforms = '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "deposit_intents" (
  "id"                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Always the session's profile, never a request field. Plain scalar, no FK:
  -- relations are enforced app-side throughout this schema.
  "profile_id"         integer        NOT NULL,
  -- The receiving wallet at the time, so a later wallet change does not make an
  -- old intent point somewhere else.
  "wallet_address"     varchar(100)   NOT NULL,
  -- An `id` from config.deposit_platforms. Not constrained: the catalog is data,
  -- and a platform removed from it must not make its old rows invalid.
  "platform_id"        varchar(32)    NOT NULL,
  -- 'open' | 'arrived' | 'cancelled' | 'expired'  (CHECK in packages/db/sql/deposit_intents_checks.sql)
  "status"             varchar(16)    NOT NULL DEFAULT 'open',
  -- Set on the bridge path, once a 1Click transfer exists for this deposit.
  "bridge_transfer_id" uuid,
  "expires_at"         timestamptz(6) NOT NULL DEFAULT (now() + interval '24 hours'),
  "arrived_at"         timestamptz(6),
  "created_at"         timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"         timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_deposit_intents_profile_id"
  ON "deposit_intents" ("profile_id");

COMMENT ON TABLE "deposit_intents" IS
  'UI marker for "Deposit from another app": backs the waiting card on Home. Never moves or credits money. At most one open row per profile.';
COMMENT ON COLUMN "deposit_intents"."status" IS
  'open | arrived | cancelled | expired. Arrival is the wallet balance going up, reported by the client.';

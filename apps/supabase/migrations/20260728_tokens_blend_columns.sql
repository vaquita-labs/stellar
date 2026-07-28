-- Blend config moves from client env vars to the tokens table so the web app
-- reads it from the project config at runtime:
--   issuer                       G-address of the asset behind contract_address
--                                (tells it apart from same-code assets from
--                                other issuers)
--   blend_pool_contract_address  Blend V2 pool that accepts this token as
--                                reserve (direct-to-Blend deposit)

ALTER TABLE "tokens"
  ADD COLUMN IF NOT EXISTS "issuer" varchar(56);

ALTER TABLE "tokens"
  ADD COLUMN IF NOT EXISTS "blend_pool_contract_address" varchar(128);

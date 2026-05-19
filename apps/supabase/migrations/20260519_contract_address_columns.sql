-- Move contract addresses from env vars into the database.
-- tokens_networks: per-token DeFindex vault address (replaces STELLAR_DEFINDEX_VAULT_CONTRACT env var)
-- networks: per-network badge contract address (replaces BADGE_CONTRACT_ID env var)

ALTER TABLE tokens_networks
  ADD COLUMN IF NOT EXISTS defindex_vault_contract_address text;

ALTER TABLE networks
  ADD COLUMN IF NOT EXISTS badges_contract_address text;

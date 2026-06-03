-- project_config: single-network cleanup.
-- Rename `name` -> `network_name` (the singleton now names the one network) and
-- drop the unused `layer`, `type`, and `smart_contract_env` columns.

ALTER TABLE project_config
  RENAME COLUMN name TO network_name;

ALTER TABLE project_config
  DROP COLUMN IF EXISTS layer,
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS smart_contract_env;

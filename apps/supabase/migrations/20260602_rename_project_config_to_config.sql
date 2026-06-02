-- Rename the singleton `project_config` table to `config`.
-- Runs after 20260602_project_config_network_name.sql (which renames the
-- `name` column on the still-named project_config table).

ALTER TABLE project_config
  RENAME TO config;

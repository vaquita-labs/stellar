-- profiles: per-user display preferences.
-- `language` and `currency` hold the option ids the user picked on the
-- Preferences page (e.g. 'en', 'usd'). They mirror the `id` of an entry in the
-- project config's `languages` / `currencies` lists. Both NULL until the user
-- changes them, in which case the UI falls back to the first configured option.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS language VARCHAR(10),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10);

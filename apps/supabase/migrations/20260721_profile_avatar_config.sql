-- profiles: replace uploaded photos with the character-avatar builder.
--
-- `avatar_config` stores the user's picks from the @vaquita/avatar catalog
-- (part ids + palette indices), e.g.
--   {"v":1,"skinColor":2,"hair":"curly","hairColor":0,"clothes":"hoodie",...}
-- The SVG is composed at render time from that JSON, so cosmetics can be added
-- or re-tuned without a data migration. NULL = the user never opened the
-- editor; the client renders a deterministic avatar seeded from the wallet.
--
-- Photo uploads are removed product-wide (no endpoint, no storage), so the
-- MinIO columns go with them. The objects themselves live in the avatars
-- bucket and can be dropped separately once this ships.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_config JSONB;

ALTER TABLE profiles
  DROP COLUMN IF EXISTS avatar_url,
  DROP COLUMN IF EXISTS avatar_key;

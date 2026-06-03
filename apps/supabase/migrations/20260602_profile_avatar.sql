-- profiles: profile-photo support.
-- `avatar_url` holds the public MinIO (S3-compatible) URL rendered for the user;
-- `avatar_key` holds the object key so we can delete the old object when the
-- photo is replaced or removed. Both NULL while the user keeps the default.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS avatar_key VARCHAR(300);

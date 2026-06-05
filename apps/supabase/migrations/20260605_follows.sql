-- follows: unidirectional follow graph between profiles.
-- A row means `follower_id` follows `followee_id` (Twitter-style, not mutual).
-- The unique pair prevents duplicate follows; both FKs cascade so a deleted
-- profile drops its edges. The self-follow check keeps the graph clean.

CREATE TABLE IF NOT EXISTS follows (
  id          SERIAL PRIMARY KEY,
  follower_id INTEGER     NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  followee_id INTEGER     NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT follows_no_self CHECK (follower_id <> followee_id),
  CONSTRAINT follows_unique_pair UNIQUE (follower_id, followee_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);

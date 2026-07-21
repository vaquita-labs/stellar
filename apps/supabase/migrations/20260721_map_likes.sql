-- map_likes: hearts given to a profile's 3D world from the explore /
-- leaderboard feed. Until now the heart button was purely client-side state,
-- so a like vanished on reload and every counter read 0.
--
-- One row per (liker, owner) pair: the unique index makes liking idempotent and
-- makes the count "how many distinct vaqueros liked this map" rather than "how
-- many times the button was tapped". Both sides cascade so deleting a profile
-- takes its likes with it (given and received).

CREATE TABLE IF NOT EXISTS map_likes (
  id         SERIAL PRIMARY KEY,
  liker_id   INTEGER     NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  owner_id   INTEGER     NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS map_likes_unique_pair ON map_likes (liker_id, owner_id);

-- liker → "which maps did I like" (seeds the feed's heart buttons in one query);
-- owner → "how many hearts does this map have" (the profile stat + feed counts).
CREATE INDEX IF NOT EXISTS idx_map_likes_liker ON map_likes (liker_id);
CREATE INDEX IF NOT EXISTS idx_map_likes_owner ON map_likes (owner_id);

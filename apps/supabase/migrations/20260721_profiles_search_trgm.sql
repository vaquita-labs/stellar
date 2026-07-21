-- Friend search (/profile/friends/search) matches `nickname` / `full_name` with
-- ILIKE '%term%'. Without an index that is a sequential scan over `profiles` on
-- every keystroke burst — fine at 113 rows, fatal at a million.
--
-- pg_trgm + GIN makes ILIKE (both '%term%' and 'term%') index-backed, so search
-- cost tracks the number of MATCHING rows, not the table size. The service caps
-- the page (LIMIT ≤ 50) and refuses queries shorter than 2 characters.
--
-- On a large production table create these with CONCURRENTLY (outside a
-- transaction) so writes aren't blocked.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS profiles_nickname_trgm_idx
  ON profiles USING gin (nickname gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_full_name_trgm_idx
  ON profiles USING gin (full_name gin_trgm_ops);

-- referrals: invite-a-friend graph on top of the existing profiles.
--
-- Each profile owns a short, human-shareable `referral_code` (the string the
-- user reads out / puts in a link). When a new user signs up through someone's
-- code we record `referred_by_id` on the NEW profile — a self-reference back to
-- the referrer. That single edge is enough to answer both directions:
--   • "who did I refer?"  -> profiles WHERE referred_by_id = me
--   • "who referred me?"  -> follow referred_by_id
--
-- We keep the relationship on `profiles` itself (not a join table) because it is
-- strictly 1→many and set exactly once at signup: a profile has at most one
-- referrer, forever. The APY boost is derived at read time from how many of
-- those referred profiles are "active" (have a live deposit), so there is no
-- earnings ledger here yet — that lands with the payout engine.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code   VARCHAR(12),
  ADD COLUMN IF NOT EXISTS referred_by_id  INTEGER;

-- One code per profile, case-sensitive. NULLs allowed (codes are minted lazily
-- on first read) and a partial unique index keeps them collision-free.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique
  ON profiles (referral_code)
  WHERE referral_code IS NOT NULL;

-- The referrer must be an existing profile. ON DELETE SET NULL: if a referrer's
-- account is removed, their referrals simply lose the attribution rather than
-- being deleted along with them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_referred_by_fk'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_referred_by_fk
      FOREIGN KEY (referred_by_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_referred_by
  ON profiles (referred_by_id);

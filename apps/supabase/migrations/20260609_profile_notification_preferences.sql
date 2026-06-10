-- profiles: per-user notification preferences picked on the Notifications page.
-- JSON object keyed by toggle id ({ push, email, deposits, streaks, friends }),
-- each a boolean. NULL until the user changes something, in which case the API
-- serves the defaults (push/deposits/streaks on, email/friends off).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB;

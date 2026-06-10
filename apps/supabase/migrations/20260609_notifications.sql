-- In-app notifications feed (bell in the home header → /notifications).
-- One row per event per recipient. `message_key` + `params` map to i18n entries
-- on the frontend (notificationsCenter.messages.*) so copy stays translatable;
-- `link` is the in-app route the notification navigates to when tapped.
-- `dedupe_key` makes event emission idempotent (e.g. re-follows, lazy
-- deposit-unlock sweeps): a duplicate insert is a silent no-op for the caller.
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGSERIAL PRIMARY KEY,
  profile_id  INTEGER      NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        VARCHAR(20)  NOT NULL,
  message_key VARCHAR(50)  NOT NULL,
  params      JSONB,
  link        VARCHAR(300),
  dedupe_key  VARCHAR(120) UNIQUE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_profile_created
  ON notifications(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_profile_unread
  ON notifications(profile_id) WHERE read_at IS NULL;

-- Record WHY each reward was granted (its source), so the daily check-in XP can
-- be summed and capped independently of any other (future) XP source.
--
-- Daily check-in rewards are stamped with reason 'daily-checkin'. The per-day XP
-- grant tops up to the admin-configured `config.daily_checkin_experience` cap:
-- grant = max(cap - sum(today's 'daily-checkin' experience), 0), so a profile
-- never earns more than the configured amount per UTC day.
--
-- NULL for historical rows (origin unknown / pre-dates this column).

ALTER TABLE profiles_rewards
  ADD COLUMN IF NOT EXISTS reason text;

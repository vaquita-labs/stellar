-- Who is running Vaquita as an installed app, and on what platform.
--
-- WHY THIS EXISTS. Push notifications are the feature the roadmap depends on,
-- and on iOS a web app can only receive push once it has been added to the home
-- screen. `push_subscriptions` counts devices that granted permission, which is
-- a later and much smaller step; nothing counted the install itself, so there
-- was no way to tell whether the install prompt was working or who could still
-- be asked.
--
-- THIS IS AN OBSERVATION, NOT AN EVENT. No browser offers "am I installed?" as
-- a question. Chromium fires `appinstalled` once, in the tab that prompted, and
-- every launch of an installed app reports `display-mode: standalone`. iOS
-- Safari fires nothing whatsoever, so standalone is the ONLY iOS signal. The
-- client reports both, which means a row appears on the first launch of the
-- installed app rather than at the moment of installing — on iOS those can be
-- days apart, and there is no way to close that gap.
--
-- NOTHING REPORTS AN UNINSTALL. A deleted app simply stops launching, so
-- `last_seen_at` going stale is all the evidence there will ever be. Read it as
-- "still in use", never delete a row on its behalf: the install did happen, and
-- a row removed on a hunch would take the install date with it.
--
-- ONE ROW PER PROFILE PER PLATFORM. The question is how many users hold the app
-- and can be reached by push, so a second Android phone is not a second user; a
-- user with both an iPhone and an Android is two platforms worth knowing about.

CREATE TABLE IF NOT EXISTS "pwa_installs" (
  "id"           serial         PRIMARY KEY,
  "profile_id"   integer        NOT NULL REFERENCES "profiles" ("id") ON DELETE CASCADE,
  -- 'android' | 'ios' | 'desktop' | 'other'
  -- (CHECK in packages/db/sql/pwa_installs_enums.sql)
  "platform"     varchar(16)    NOT NULL,
  "user_agent"   varchar(300),
  -- First observation. Never updated on a re-report: it is the install date.
  "installed_at" timestamptz(6) NOT NULL DEFAULT now(),
  -- Moves on every launch of the installed app.
  "last_seen_at" timestamptz(6) NOT NULL DEFAULT now(),
  "created_at"   timestamptz(6) NOT NULL DEFAULT now()
);

-- The upsert key. Without it every launch would file another row and the
-- install count would be a launch count.
CREATE UNIQUE INDEX IF NOT EXISTS "pwa_installs_profile_platform_unique"
  ON "pwa_installs" ("profile_id", "platform");

CREATE INDEX IF NOT EXISTS "idx_pwa_installs_installed_at"
  ON "pwa_installs" ("installed_at");

COMMENT ON TABLE "pwa_installs" IS
  'Client-reported observations of Vaquita running as an installed PWA. One row per profile per platform. Nothing reports an uninstall.';
COMMENT ON COLUMN "pwa_installs"."installed_at" IS
  'First time the app was seen running standalone for this profile and platform. On iOS this is the first launch after adding to the home screen, which can be days after the install.';
COMMENT ON COLUMN "pwa_installs"."last_seen_at" IS
  'Most recent launch seen. A stale value is the only evidence of an uninstall there will ever be.';

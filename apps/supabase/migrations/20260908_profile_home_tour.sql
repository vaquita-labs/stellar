-- The home tour: the coach marks that walk a first-time user through the six
-- buttons on the home screen. This flag is what keeps it from running twice.
--
-- Deliberately separate from `tutorial_completed`. That one belongs to the
-- simulated deposit walkthrough on /tutorial — a different feature, with its
-- own lifecycle and its own switch. Sharing a column would have meant that
-- replaying one replays the other, and that turning the walkthrough back on
-- would re-show the tour to everybody who had already dismissed it.
--
-- Additive: every existing profile starts at false, so the tour appears once
-- for current users on their next visit and never again after they finish it.

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "home_tour_completed" boolean NOT NULL DEFAULT false;

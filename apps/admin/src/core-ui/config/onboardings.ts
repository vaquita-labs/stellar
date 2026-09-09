/**
 * The first-run experiences an admin can re-open for a user.
 *
 * This list is the only place the Onboarding screen and its API route learn
 * what exists: the table builds a column per entry and the route whitelists
 * writes against these keys. Adding a fourth onboarding is one entry here.
 *
 * `key` is both the ProfileResponseDTO field and the Prisma column name, which
 * is what lets the route pass it straight to `prisma.profile.update` — see the
 * zod enum there that keeps it from becoming an arbitrary field write.
 */
export const ONBOARDING_FLAGS = [
  {
    key: 'homeTourCompleted',
    label: 'Home tour',
    description: 'The coach marks over the six buttons on the home screen.',
  },
  {
    key: 'tutorialCompleted',
    label: 'Deposit walkthrough',
    description: 'The simulated deposit on /tutorial. Currently disabled for everyone, so clearing this shows nothing.',
  },
  {
    key: 'onboardingCompleted',
    label: 'Welcome gift',
    description: 'The 1 USDC claim offered on the first visit. Gated behind the deposit walkthrough being complete.',
  },
] as const;

export type OnboardingKey = (typeof ONBOARDING_FLAGS)[number]['key'];

export const ONBOARDING_KEYS = ONBOARDING_FLAGS.map((f) => f.key) as unknown as [OnboardingKey, ...OnboardingKey[]];

/**
 * First-run experiences this screen deliberately cannot touch. They are stored
 * in the browser, not on the profile, because each happens before there is an
 * authenticated user or is a decision about the device rather than the account.
 * Listed so the screen can say so, instead of leaving an admin hunting for a
 * toggle that cannot exist: resetting one means clearing that key in that
 * person's browser.
 */
export const DEVICE_LOCAL_ONBOARDINGS = [
  { storageKey: 'vaquita:intro-seen', label: 'Pre-login intro carousel' },
  { storageKey: 'vaquita:push-nudge-seen', label: 'Notifications nudge' },
  { storageKey: 'vaquita:install-dismissed', label: 'Install-the-app prompt' },
  { storageKey: 'vaquita:hud-hint-seen', label: 'Map HUD hint' },
] as const;

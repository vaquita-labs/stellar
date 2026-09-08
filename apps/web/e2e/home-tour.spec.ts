import type { Locator } from '@playwright/test';
import { completeUsernamePromptIfShown, createFreshSigner, expect, openSignedIn, primePage, test } from './fixtures';

/**
 * Home tour: the coach marks a first-time wallet meets on `/home`.
 *
 * Every run starts from a fresh, friendbot-funded wallet, because the tour is
 * gated on `homeTourCompleted` in the profile row: a wallet that walked it once
 * never sees it again, so a reused account would show the tour on the first run
 * and pass vacuously ever after. The replay param (`/home?tour=1`) is not a way
 * around that — a hard load bounces through the auth gate, which rebuilds the
 * URL from `usePathname()` and drops the query.
 *
 * `primePage` suppresses the tour for every other spec (see `skipHomeTour`);
 * these are the ones that opt back in.
 */

/** The chest and the side rail are `md:hidden`, so only a narrow viewport shows
 *  the whole tour. The app is a mobile PWA: this is also the layout that matters. */
test.use({ viewport: { width: 390, height: 844 } });

/**
 * The tour's own layer. While it is up, its panes swallow clicks on the home.
 *
 * The attribute alone is not enough: react-aria stamps it on the toast region
 * too, which is on screen right after the username prompt saves. The tour's
 * layer is the roleless one — it is pure decoration around the cutout.
 */
const OVERLAY = 'div[data-react-aria-top-layer="true"]:not([role])';

/** Every step, in the order `HOME_TOUR_STEPS` walks them. */
const STEPS = [
  'Deposit and withdraw',
  'Your balance',
  'Your daily reward',
  'Explore, ranking and shop',
  'Your profile',
  'Need a hand?',
];

/**
 * Whether the element can actually be clicked right now.
 *
 * `trial` runs the actionability checks and stops short of the click, which is
 * what makes this safe to assert in both directions: the blocked case never
 * risks a stray navigation, and the unblocked case never opens a panel.
 */
async function isClickable(locator: Locator): Promise<boolean> {
  return locator
    .click({ trial: true, timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
}

test.describe('home tour', () => {
  test.describe.configure({ mode: 'serial' });

  test('walks a first-time wallet through the home and then gets out of the way', async ({ page }) => {
    const signer = await createFreshSigner();
    await primePage(page, signer, { homeTour: true });
    await openSignedIn(page, '/home');
    await completeUsernamePromptIfShown(page);

    // The tour settles for whichever anchors are up, so it opens a beat after the home does.
    await expect(page.getByRole('heading', { name: STEPS[0] })).toBeVisible({ timeout: 60_000 });
    const overlay = page.locator(OVERLAY);
    await expect(overlay).toBeVisible();

    // The spotlighted button is visible but sealed off: a tap on the real thing
    // would navigate away and abandon the tour.
    const deposit = page.getByRole('button', { name: 'Deposit' });
    await expect(deposit).toBeVisible();
    expect(await isClickable(deposit)).toBe(false);

    // Every step, in order. Only the last one drops `Skip` and closes the tour.
    // The card lives inside the layer, and scoping to it keeps the walk off the
    // dev-tools button the local server injects, whose name also starts with "Next".
    for (const [index, title] of STEPS.entries()) {
      await expect(overlay.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
      const last = index === STEPS.length - 1;
      await expect(overlay.getByRole('button', { name: 'Skip' })).toHaveCount(last ? 0 : 1);
      await overlay.getByRole('button', { name: last ? 'Got it' : 'Next' }).click();
    }

    await expect(overlay).toHaveCount(0);
    // The home is live again: the button the tour was covering takes a click.
    expect(await isClickable(deposit)).toBe(true);
  });

  test('Skip ends the tour on the first step', async ({ page }) => {
    const signer = await createFreshSigner();
    await primePage(page, signer, { homeTour: true });
    await openSignedIn(page, '/home');
    await completeUsernamePromptIfShown(page);

    const overlay = page.locator(OVERLAY);
    await expect(overlay.getByRole('heading', { name: STEPS[0] })).toBeVisible({ timeout: 60_000 });

    // The tap marks the flag locally and fires the write; the overlay goes on
    // the tap, not on the round trip. Only the request is asserted, never its
    // status: the tour is built to close either way, and a write the API
    // refuses costs the user nothing but seeing the tour again.
    const saved = page.waitForRequest((r) => /\/profile\/wallet\/[^/]+\/flags$/.test(r.url()) && r.method() === 'PATCH', {
      timeout: 60_000,
    });
    await overlay.getByRole('button', { name: 'Skip' }).click();
    await expect(overlay).toHaveCount(0);
    await saved;
  });

  test('a wallet that already walked the tour lands on a clear home', async ({ homePage: page }) => {
    // `homePage` is primed the way every other spec is: the profile read answers
    // with the flag set, so there are no coach marks and the home takes clicks.
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    await page.getByRole('button', { name: 'Deposit' }).click();
    await expect(page.getByRole('heading', { name: 'Select method' })).toBeVisible();
  });
});

import { expect, test } from './fixtures';

/**
 * What the auth gate hands to `/login` is where the visitor gets sent back to
 * after signing in, and it has to carry the query string.
 *
 * Private routes keep state there — `?tx=` opens a transaction's detail,
 * `?period=` picks the portfolio's window. Someone opening a shared link
 * without a session meets the gate first, and `redirect` is the only record of
 * where they were going: a path without its query lands them on the plain screen
 * with no way back to the thing the link was for.
 *
 * Arriving with no session is the whole setup, and it is the only way to see
 * this: with the signer primed the shim logs in before the gate ever fires, so
 * the URL is never rebuilt and a dropped query would go unnoticed. Same trick as
 * `onboarding.spec.ts` — prime the locale, never the secret.
 */
const DEEP_LINK = '/transactions?tx=e2e-deep-link-probe';

test.describe('deep link', () => {
  test('the auth gate sends the whole URL to the login screen, query included', async ({ page }) => {
    // No secret primed: the shim stays idle and the gate does its job.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('vaquita-lang', 'en');
        window.localStorage.setItem('vaquita:intro-seen', 'true');
      } catch {
        // A blocked storage only costs us the locale default.
      }
    });

    await page.goto(DEEP_LINK);
    await expect(page).toHaveURL(/\/login/, { timeout: 60_000 });

    // `redirect` is what `LoginPage` replays once the wallet is in. It has to be
    // the URL that was asked for, not just its path.
    const redirect = new URL(page.url()).searchParams.get('redirect');
    expect(redirect).toBe(DEEP_LINK);
  });
});

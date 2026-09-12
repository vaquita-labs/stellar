import {
  completeUsernamePromptIfShown,
  createFreshSigner,
  expect,
  namePrompt,
  openSignedIn,
  primePage,
  test,
  uniqueHandle,
} from './fixtures';

/**
 * Onboarding: a wallet that has never used Vaquita signs in and is walked
 * through choosing a username before it can see its world.
 *
 * Every run mints a fresh friendbot account so the flow starts from the real
 * first-visit state (no profile, no nickname) instead of depending on what a
 * previous run left behind.
 */
test.describe('onboarding', () => {
  test.describe.configure({ mode: 'serial' });

  test('a new wallet signs in, picks a username and lands on its home', async ({ page }) => {
    const signer = await createFreshSigner();
    await primePage(page, signer);
    await openSignedIn(page, '/home');

    // The username gate holds the private routes until a nickname exists.
    await expect(page.getByRole('heading', { name: namePrompt.title })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(namePrompt.subtitle)).toBeVisible();

    const input = page.getByPlaceholder(namePrompt.placeholder, { exact: true });
    const continueButton = page.getByRole('button', { name: 'Continue' });
    await expect(continueButton).toBeDisabled();

    // Too short: the helper says so and the CTA stays disabled.
    await input.fill('ab');
    await expect(page.getByText('At least 3 characters')).toBeVisible();
    await expect(continueButton).toBeDisabled();

    const handle = uniqueHandle();
    await input.fill(handle);
    await expect(page.getByText(`@${handle} is available`)).toBeVisible();
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    // Saving the nickname needs a Vaquita API session, which the wallet signs (SEP-10) on the fly.
    await expect(page.getByText(namePrompt.savedToast)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: namePrompt.title })).toBeHidden({ timeout: 30_000 });

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('button', { name: 'Deposit' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  });

  test('a returning wallet skips the username prompt and reloads straight into its home', async ({ page }) => {
    const signer = await createFreshSigner();
    await primePage(page, signer);
    await openSignedIn(page, '/home');
    expect(await completeUsernamePromptIfShown(page)).toBe(true);
    await expect(page.getByRole('button', { name: 'Deposit' })).toBeVisible({ timeout: 60_000 });

    // Pollar restores the session from storage; the gate must not bounce to /login nor re-ask for a name.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Deposit' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: namePrompt.title })).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('an unauthenticated visitor is sent to the login screen', async ({ page }) => {
    // No secret primed: the shim stays idle and the auth gate does its job.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('vaquita-lang', 'en');
        window.localStorage.setItem('vaquita:intro-seen', 'true');
      } catch {
        // ignore
      }
    });
    await page.goto('/home');
    await expect(page).toHaveURL(/\/login/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});

import {
  completeUsernamePromptIfShown,
  createFreshSigner,
  dialog,
  expect,
  namePrompt,
  openSignedIn,
  primePage,
  test,
  type Signer,
} from './fixtures';

/**
 * Legal gate: a wallet cannot reach anything private until it has accepted the
 * current legal bundle, and the acceptance is recorded server-side against the
 * wallet rather than kept in the browser.
 *
 * `LegalGate` replaces the private tree instead of overlaying it, so this is
 * also what stands between a brand-new wallet and every other flow in the suite.
 */
const GATE_TITLE = 'Before you continue';

test.describe('legal gate', () => {
  test.describe.configure({ mode: 'serial' });

  // The wallet that accepts in the first test is the one the second checks is
  // remembered; each test gets its own browser context, so it is carried here.
  let accepted: Signer;

  test('holds a fresh wallet until both statements are accepted', async ({ page }) => {
    test.setTimeout(240_000);
    const signer = await createFreshSigner();
    accepted = signer;
    await primePage(page, signer);
    // Opt out of the fixture's own acceptance: the gate is what is under test.
    await openSignedIn(page, '/home', { acceptLegal: false });

    const gate = dialog(page);
    await expect(page.getByRole('heading', { name: GATE_TITLE })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Please review and accept the documents that govern your use of Vaquita.')).toBeVisible();

    // Nothing of the private tree is reachable behind it.
    await expect(page.getByRole('button', { name: 'Deposit' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: namePrompt.title })).toHaveCount(0);

    // The three documents are linked for review.
    for (const name of ['Privacy Policy', 'Terms of Service', 'Risk Disclosure']) {
      await expect(gate.getByRole('link', { name }).first()).toBeVisible();
    }

    // Both statements are required, and each on its own is not enough.
    const boxes = gate.getByRole('checkbox');
    await expect(boxes).toHaveCount(2);
    const confirm = gate.getByRole('button', { name: 'Accept and continue' });
    await expect(confirm).toBeDisabled();

    await boxes.nth(0).check();
    await expect(confirm).toBeDisabled();
    await boxes.nth(0).uncheck();
    await boxes.nth(1).check();
    await expect(confirm).toBeDisabled();
    await boxes.nth(0).check();
    await expect(confirm).toBeEnabled();

    // Accepting is recorded server-side, then the app opens up.
    const recorded = page.waitForResponse((r) => r.url().includes('/legal/accept') && r.request().method() === 'POST', {
      timeout: 60_000,
    });
    await confirm.click();
    expect((await recorded).status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: GATE_TITLE })).toBeHidden({ timeout: 30_000 });

    // A fresh wallet lands on the username prompt, which the gate was hiding.
    await expect(page.getByRole('heading', { name: namePrompt.title })).toBeVisible({ timeout: 60_000 });
    await completeUsernamePromptIfShown(page);
    await expect(page.getByRole('button', { name: 'Deposit' })).toBeVisible({ timeout: 60_000 });
  });

  test('does not ask the same wallet again in a new session', async ({ page }) => {
    test.setTimeout(240_000);
    // The acceptance belongs to the wallet on the server, so a browser that
    // knows nothing about it — a fresh context, no storage — must not re-gate.
    await primePage(page, accepted);
    await openSignedIn(page, '/home', { acceptLegal: false });
    await expect(page.getByRole('button', { name: 'Deposit' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: GATE_TITLE })).toHaveCount(0);
  });
});

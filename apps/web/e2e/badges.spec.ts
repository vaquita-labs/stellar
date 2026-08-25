import { completeUsernamePromptIfShown, createFreshSigner, expect, gotoPrivate, openSignedIn, primePage, test } from './fixtures';

/**
 * NFT badges: an achievement unlocks, the user claims it and the badge is
 * minted on-chain (`mint_badge` on the badges contract, paid by the wallet),
 * after which the API credits the reward.
 *
 * "Crew Mate" (`first_friend`) unlocks on the first follow, which needs no
 * funds beyond friendbot XLM for the mint fee — so every run starts from a
 * fresh wallet and exercises the full unlock → claim → mint → reward path.
 */
const BADGE_TITLE = 'Crew Mate';

test.describe('badges', () => {
  test.describe.configure({ mode: 'serial' });

  test('a fresh wallet sees its awards locked', async ({ page }) => {
    const signer = await createFreshSigner();
    await primePage(page, signer);
    await openSignedIn(page, '/home');
    await completeUsernamePromptIfShown(page);

    await gotoPrivate(page, '/profile/achievements');
    await expect(page.getByRole('heading', { name: 'Achievements' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Awards' })).toBeVisible();

    const tile = page.getByRole('button', { name: BADGE_TITLE });
    await expect(tile).toBeVisible({ timeout: 60_000 });
    await tile.click();
    await expect(page.getByRole('heading', { name: BADGE_TITLE })).toBeVisible();
    await expect(page.getByText('Follow your first fellow vaquero.')).toBeVisible();
    // Nothing to claim yet: the CTA only renders once the badge is unlocked.
    await expect(page.getByRole('button', { name: 'Claim award' })).toHaveCount(0);
    await expect(page.getByText('0 / 19')).toBeVisible();
  });

  test('unlocking, claiming and minting a badge credits the reward', async ({ page }) => {
    test.setTimeout(300_000);
    const signer = await createFreshSigner();
    await primePage(page, signer);
    await openSignedIn(page, '/home');
    await completeUsernamePromptIfShown(page);

    // Unlock: follow the first saver on the leaderboard who is not us.
    await gotoPrivate(page, '/leaderboard');
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible({ timeout: 60_000 });
    const rows = page.getByRole('link', { name: /^View .+'s world$/ });
    await expect(rows.first()).toBeVisible({ timeout: 90_000 });
    await rows.filter({ hasNot: page.getByText('You', { exact: true }) }).first().click();
    const follow = page.getByRole('button', { name: /^Follow / });
    await expect(follow).toBeVisible({ timeout: 60_000 });
    // Wait on the POST itself, not on the button label: the mutation flips to
    // "Unfollow" optimistically, so the label alone would go green even for a
    // follow the API rejected — and the badge would then never unlock, far from
    // here and with no hint why.
    const followed = page.waitForResponse(
      (r) => r.url().includes('/follows/') && r.request().method() === 'POST' && r.status() < 400,
      { timeout: 60_000 },
    );
    await follow.click();
    await followed;
    await expect(page.getByRole('button', { name: /^Unfollow / })).toBeVisible({ timeout: 60_000 });

    // Claim: reopen the badge until the award is on offer.
    //
    // "Crew Mate" is derived from the follow counts, which the app keeps in a
    // react-query entry that stays fresh for 24h and is persisted to
    // localStorage — and the API's own count can lag the follow that just
    // landed. So each attempt drops the persisted cache and reloads, giving the
    // screen a genuinely fresh count instead of the pre-follow zero.
    const tile = page.getByRole('button', { name: BADGE_TITLE });
    const claim = page.getByRole('button', { name: 'Claim award' });
    await expect(async () => {
      await page.evaluate(() => {
        try {
          window.localStorage.removeItem('vaquita-rq-cache');
        } catch {
          // A blocked storage means nothing was persisted to begin with.
        }
      });
      // "Crew Mate" unlocks off the follow count, so the page is only ready to
      // be read once that response has landed — the grid renders the award
      // locked until then.
      const counts = page.waitForResponse(
        (r) => r.url().includes('/follows/') && r.url().includes('/counts') && r.status() < 400,
        { timeout: 60_000 },
      );
      await gotoPrivate(page, '/profile/achievements');
      await expect(tile).toBeVisible({ timeout: 60_000 });
      await counts;
      await tile.click();
      await expect(page.getByRole('heading', { name: BADGE_TITLE })).toBeVisible();
      await expect(claim).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 180_000, intervals: [5_000] });
    await claim.click();

    // Mint: voucher from the API → `mint_badge` on-chain via Pollar → mint confirmation → reward.
    await expect(page.getByText('Preparing your reward…')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /^You earned \d+ coins?!$/ })).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText(`${BADGE_TITLE} is now in your trophy room.`)).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // The minted badge shows its share card, and the award is no longer claimable.
    await expect(page.getByText('Achievement unlocked')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Claim award' })).toHaveCount(0);
  });
});

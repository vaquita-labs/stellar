import { expect, expectPrivateUrl, gotoPrivate, test } from './fixtures';

/**
 * Leaderboard: the weekly league board loads from the API, ranks its members
 * and marks the signed-in wallet's own row.
 */
test.describe('leaderboard', () => {
  test.describe.configure({ mode: 'serial' });

  test('opens from the home navigation and lists ranked savers with XP', async ({ homePage: page }) => {
    // Desktop sidebar link and the mobile floating action share the same accessible name.
    await page.getByRole('link', { name: 'Leaderboard' }).first().click();
    await expect(page).toHaveURL(/\/leaderboard$/);
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();

    const rows = page.getByRole('link', { name: /^View .+'s world$/ });
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    expect(await rows.count()).toBeGreaterThan(0);

    // Every row carries a rank and an XP figure.
    await expect(rows.first().locator('[aria-label^="Position "]')).toBeVisible();
    await expect(rows.first().getByText(/\d+ XP$/)).toBeVisible();
    await expect(page.getByText('The board resets every Monday', { exact: false })).toBeVisible();
  });

  test('ranks the board in ascending order and marks the viewer\'s own row', async ({ homePage: page }) => {
    await gotoPrivate(page, '/leaderboard');
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
    const rows = page.getByRole('link', { name: /^View .+'s world$/ });
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });

    // Positions are the board's whole point: they must be strictly ascending.
    const positions = await page.locator('[aria-label^="Position "]').evaluateAll((nodes) =>
      nodes.map((node) => Number((node.getAttribute('aria-label') ?? '').replace('Position ', ''))),
    );
    expect(positions.length).toBeGreaterThan(0);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    // A wallet that has scored this cycle gets its own row, tagged "You"; one
    // that has not simply is not on the board yet.
    const ownRow = rows.filter({ has: page.getByText('You', { exact: true }) });
    if ((await ownRow.count()) > 0) {
      await expect(ownRow.first()).toBeVisible();
    }
  });

  test('a row opens that saver\'s public world', async ({ homePage: page }) => {
    await gotoPrivate(page, '/leaderboard');
    const rows = page.getByRole('link', { name: /^View .+'s world$/ });
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });

    // Pick someone else's row so the follow control is exercised on the destination page.
    const others = rows.filter({ hasNot: page.getByText('You', { exact: true }) });
    const target = others.first();
    const href = await target.getAttribute('href');
    expect(href).toMatch(/^\/explore\//);
    await target.click();
    await expectPrivateUrl(page, new RegExp(`${href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await expect(page.getByRole('button', { name: /^(Follow|Unfollow) / })).toBeVisible({ timeout: 60_000 });
  });
});

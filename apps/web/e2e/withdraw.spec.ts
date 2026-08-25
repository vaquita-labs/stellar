import { dialog, expect, parseAvailable, test, typeAmount } from './fixtures';
import { usdcBalance } from './testnet-usdc';

/**
 * Withdraw: USDC sitting in the flexible savings goes back to the wallet
 * through the home "Withdraw" flow — one on-chain transaction the wallet
 * signs — and the wallet's USDC balance on Horizon reflects it.
 *
 * Needs ≥ 1 USDC in the savings position, which `deposit.spec.ts` leaves
 * behind on the same wallet (the suite runs serially in file order); the spec
 * skips with a clear message when the position is short.
 */
const WITHDRAW_USDC = '1';

test.describe('withdraw', () => {
  test.describe.configure({ mode: 'serial' });

  test('withdraws USDC from the flexible savings back to the wallet', async ({ homePage: page, signer }) => {
    test.setTimeout(300_000);
    const before = await usdcBalance(signer.publicKey);

    await page.getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByRole('heading', { name: 'Select method' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Withdraw to your bank account/ })).toBeVisible();
    await page.getByRole('button', { name: /Withdraw to a crypto wallet/ }).click();

    await expect(dialog(page).getByRole('heading', { name: 'Withdraw' })).toBeVisible();
    const available = dialog(page).getByRole('button', { name: /^Available: \$/ });
    await expect(available).toBeVisible({ timeout: 60_000 });
    const inSavings = parseAvailable((await available.textContent()) ?? '');
    test.skip(
      inSavings < Number(WITHDRAW_USDC),
      `savings position holds ${inSavings} USDC (< ${WITHDRAW_USDC}); the deposit spec must land first`,
    );
    await expect(page.getByText('Minimum withdrawal: $1 USDC.')).toBeVisible();
    // An external wallet always withdraws to itself.
    await expect(page.getByText('Your wallet')).toBeVisible();

    const review = dialog(page).getByRole('button', { name: 'Review' });
    await typeAmount(page, WITHDRAW_USDC);
    await expect(review).toBeEnabled();
    await review.click();

    await expect(page.getByRole('heading', { name: 'Confirm withdrawal' })).toBeVisible();
    await expect(page.getByText('From')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Withdrawal sent!')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText('Your funds are on their way to', { exact: false })).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Select method' })).toHaveCount(0);

    // The ledger agrees: the wallet's USDC trustline grew by what was withdrawn.
    await expect
      .poll(() => usdcBalance(signer.publicKey), { timeout: 90_000, intervals: [3_000] })
      .toBeGreaterThan(before);
  });

  test('cannot withdraw more than the savings hold', async ({ homePage: page }) => {
    await page.getByRole('button', { name: 'Withdraw' }).click();
    await page.getByRole('button', { name: /Withdraw to a crypto wallet/ }).click();
    const available = dialog(page).getByRole('button', { name: /^Available: \$/ });
    await expect(available).toBeVisible({ timeout: 60_000 });
    const inSavings = parseAvailable((await available.textContent()) ?? '');

    await typeAmount(page, String(Math.ceil(inSavings) + 1));
    await dialog(page).getByRole('button', { name: 'Review' }).click();
    await expect(page.getByRole('heading', { name: 'Confirm withdrawal' })).toHaveCount(0);
    await expect(available).toBeVisible();

    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  });
});

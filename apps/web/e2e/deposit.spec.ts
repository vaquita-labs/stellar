import { clearAmount, dialog, expect, parseAvailable, test, typeAmount } from './fixtures';
import { ensureTestnetUsdc } from './testnet-usdc';

/**
 * Deposit: USDC held in the wallet is moved into the flexible savings position
 * (the DeFindex vault, or the Blend pool when the vault flag is off) through
 * the home "Deposit" flow — one on-chain transaction the wallet signs.
 *
 * Needs ≥ 1 pool USDC in the wallet; `ensureTestnetUsdc` tops it up from the
 * Blend testnet faucet and the spec skips (rather than fails) if that is not
 * possible, e.g. the faucet being down.
 */
const DEPOSIT_USDC = '1';

test.describe('deposit', () => {
  test.describe.configure({ mode: 'serial' });

  test('deposits USDC from the wallet into the flexible savings', async ({ homePage: page, signer }) => {
    test.setTimeout(300_000);
    const balance = await ensureTestnetUsdc(signer, Number(DEPOSIT_USDC));
    test.skip(
      balance < Number(DEPOSIT_USDC),
      `wallet ${signer.publicKey} holds ${balance} pool USDC (< ${DEPOSIT_USDC}); fund it and rerun`,
    );

    await page.getByRole('button', { name: 'Deposit' }).click();
    await expect(page.getByRole('heading', { name: 'Select method' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Deposit with your local currency/ })).toBeVisible();

    // An external wallet already holds the USDC, so "Wallet" goes straight to the amount step.
    await page.getByRole('button', { name: /Deposit from a crypto wallet/ }).click();

    const available = dialog(page).getByRole('button', { name: /^Available: \$/ });
    await expect(available).toBeVisible({ timeout: 60_000 });
    const onChain = parseAvailable((await available.textContent()) ?? '');
    expect(onChain).toBeGreaterThanOrEqual(Number(DEPOSIT_USDC));
    await expect(page.getByText('Minimum deposit: $1 USDC.')).toBeVisible();

    const review = dialog(page).getByRole('button', { name: 'Review' });
    await typeAmount(page, DEPOSIT_USDC);
    await expect(review).toBeEnabled();
    await review.click();

    await expect(page.getByRole('heading', { name: 'Confirm deposit' })).toBeVisible();
    await expect(page.getByText('Estimated APY')).toBeVisible();
    await page.getByRole('button', { name: 'Deposit to your savings' }).click();

    // Build → sign (local key) → submit → ledger confirmation.
    await expect(page.getByText('Deposit sent!')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText('Your USDC is now earning in your savings.')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Select method' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Deposit' })).toBeVisible();
  });

  test('refuses an amount below the minimum and above the available balance', async ({ homePage: page }) => {
    await page.getByRole('button', { name: 'Deposit' }).click();
    await page.getByRole('button', { name: /Deposit from a crypto wallet/ }).click();
    const available = dialog(page).getByRole('button', { name: /^Available: \$/ });
    await expect(available).toBeVisible({ timeout: 60_000 });
    const onChain = parseAvailable((await available.textContent()) ?? '');

    const review = dialog(page).getByRole('button', { name: 'Review' });
    // Under the $1 minimum the CTA stays disabled; the minimum note explains why.
    await typeAmount(page, '0.5');
    await expect(review).toBeDisabled();

    // More than the wallet holds: the CTA is live but refuses to advance.
    await clearAmount(page, 3);
    await typeAmount(page, String(Math.ceil(onChain) + 1));
    await expect(review).toBeEnabled();
    await review.click();
    await expect(page.getByRole('heading', { name: 'Confirm deposit' })).toHaveCount(0);
    await expect(available).toBeVisible();

    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: 'Deposit' })).toBeVisible();
  });
});

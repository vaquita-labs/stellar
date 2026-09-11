import { expect, test as base, type ConsoleMessage, type Page } from '@playwright/test';
import { Keypair } from '@stellar/stellar-sdk';

/**
 * Shared fixtures for the critical-flow suite.
 *
 * The browser is primed before the app boots (`addInitScript`) with the
 * signer secret the `@pollar/react` shim reads, an English locale and the
 * "intro already seen" flag. From there the app logs itself in: the shim
 * registers a local-key wallet adapter and calls Pollar's `login()` with it,
 * `PollarBridge` mirrors the address into the store and `useAuthGate` lets the
 * private routes render.
 *
 * `E2E_STELLAR_SECRET` names the funded testnet account every spec that moves
 * money uses; specs that only need a wallet identity (onboarding, badges) mint
 * a throwaway keypair through friendbot so they behave the same on every run.
 */

const FRIENDBOT = 'https://friendbot.stellar.org';

/** Log lines the shim prints; the fixture waits on them instead of guessing at timings. */
const LOGIN_OK = '[e2e-signer] logged in as';
const LOGIN_FAILED = '[e2e-signer] login failed';

export type Signer = { publicKey: string; secret: string };

export async function fundWithFriendbot(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(publicKey)}`);
  // Friendbot answers 400 for an account it already funded; that is fine.
  if (!res.ok && res.status !== 400) {
    throw new Error(`friendbot failed for ${publicKey}: ${res.status} ${await res.text()}`);
  }
}

/** A brand-new, friendbot-funded testnet account. */
export async function createFreshSigner(): Promise<Signer> {
  const keypair = Keypair.random();
  await fundWithFriendbot(keypair.publicKey());
  return { publicKey: keypair.publicKey(), secret: keypair.secret() };
}

export function primaryStellarSigner(): Signer {
  const secret = process.env.E2E_STELLAR_SECRET;
  if (!secret) {
    throw new Error('E2E_STELLAR_SECRET is not set — see apps/web/e2e/README.md for the required environment.');
  }
  return { publicKey: Keypair.fromSecret(secret).publicKey(), secret };
}

/**
 * Prime a page so the app boots signed in as `signer`, in English and without
 * the home tour. Pass `homeTour: true` to let the tour run; `home-tour.spec.ts`
 * is the only caller that wants it.
 */
export async function primePage(page: Page, signer: Signer, { homeTour = false }: { homeTour?: boolean } = {}): Promise<void> {
  await page.addInitScript((secret: string) => {
    window.__E2E_STELLAR_SECRET__ = secret;
    try {
      window.localStorage.setItem('vaquita-lang', 'en');
      window.localStorage.setItem('vaquita:intro-seen', 'true');
    } catch {
      // A blocked storage only costs us the locale default; the signer still works.
    }
  }, signer.secret);
  if (!homeTour) await skipHomeTour(page);
}

/**
 * Answer the profile read with `homeTourCompleted: true`, so the home tour
 * never starts.
 *
 * `HomeTour` covers the element it explains with a `pointer-events-auto` pane,
 * so while it runs a click on Deposit, Withdraw or the side rail lands on the
 * overlay and times out. The flag lives in the profile row, not in storage, and
 * no spec finishes the tour, so every wallet would meet it on every run.
 *
 * Rewriting the response beats dismissing the tour by hand: the tour starts
 * once its anchors are up, which is a race no fixture can wait on.
 *
 * The whole handler is guarded because the app keeps polling the profile: a spec
 * that ends while one of those reads is in flight leaves `route.fetch()` with no
 * page to answer to, and Playwright reports that as a failure of the spec that
 * had already passed. There is nothing to salvage at that point — the route is
 * abandoned and the run moves on.
 */
async function skipHomeTour(page: Page): Promise<void> {
  await page.route('**/api/v1/profile/wallet/*/data', async (route) => {
    try {
      const response = await route.fetch();
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return await route.fulfill({ response }); // Not JSON (an error page): pass it through untouched.
      }
      const data = (body as { data?: Record<string, unknown> } | null)?.data;
      if (data) data.homeTourCompleted = true;
      return await route.fulfill({ response, json: body });
    } catch {
      return; // The page is gone (the spec ended): nobody is waiting for this.
    }
  });
}

/**
 * Navigate to `path` and wait for the shim to report a Pollar session. The
 * promise for the console line is set up before navigation so a fast login
 * can never be missed.
 */
export async function openSignedIn(
  page: Page,
  path = '/home',
  { acceptLegal = true }: { acceptLegal?: boolean } = {},
): Promise<void> {
  const loggedIn = new Promise<void>((resolve, reject) => {
    const onConsole = (message: ConsoleMessage) => {
      const text = message.text();
      if (text.startsWith(LOGIN_OK)) {
        page.off('console', onConsole);
        resolve();
      } else if (text.startsWith(LOGIN_FAILED)) {
        page.off('console', onConsole);
        reject(new Error(text));
      }
    };
    page.on('console', onConsole);
  });
  await page.goto(path);
  await loggedIn;
  // The app shell only renders private routes once the wallet address is mirrored into the store.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  // `LegalGate` replaces the whole private tree until the wallet has accepted
  // the current bundle, so every fresh wallet meets it before anything else.
  // `legal.spec.ts` passes `acceptLegal: false` to test the gate itself.
  if (acceptLegal) await acceptLegalGateIfShown(page);
}

/**
 * Accept the legal bundle when the gate is up, and report whether it was.
 *
 * A wallet that has already accepted the current version never sees it, so the
 * gate is awaited against the screens that replace it rather than with a fixed
 * pause. The acceptance is confirmed by the POST the modal sends, not by the
 * modal closing: the button also clears on a failure the app renders inline.
 */
export async function acceptLegalGateIfShown(page: Page): Promise<boolean> {
  const heading = page.getByRole('heading', { name: 'Before you continue' });
  const username = page.getByRole('heading', { name: 'Choose your username' });
  const homeDeposit = page.getByRole('button', { name: 'Deposit' });
  await expect(heading.or(username).or(homeDeposit).first()).toBeVisible({ timeout: 60_000 });
  if (!(await heading.isVisible())) return false;

  const gate = dialog(page);
  // Two separate boxes on purpose: the documents, and the eligibility attestation.
  const boxes = gate.getByRole('checkbox');
  await expect(boxes).toHaveCount(2);
  const confirm = gate.getByRole('button', { name: 'Accept and continue' });
  await expect(confirm).toBeDisabled();
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(confirm).toBeEnabled();

  const recorded = page.waitForResponse(
    (r) => r.url().includes('/legal/accept') && r.request().method() === 'POST' && r.status() < 400,
    { timeout: 60_000 },
  );
  await confirm.click();
  await recorded;
  await expect(heading).toBeHidden({ timeout: 30_000 });
  return true;
}

/**
 * Navigate to a private route by URL.
 *
 * A full page load restarts the Pollar client, which does not restore the
 * session for a local-key wallet: the auth gate bounces to
 * `/login?redirect=…` while the shim logs in again, and the login screen then
 * returns to the requested path. Waiting for the URL to come back to `path`
 * covers both the bounce and the plain case where it never happens.
 */
export async function gotoPrivate(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expectPrivateUrl(page, new RegExp(`${escapeRegExp(path)}(\\?.*)?$`));
}

/**
 * Wait for the app to settle on a private URL.
 *
 * The gate can bounce through `/login` at any point — on a hard load, and in
 * dev also when React's StrictMode second mount makes the SDK open a second
 * Pollar client, whose refresh-token rotation invalidates the shared session.
 * The shim logs straight back in, so the detour is transient; this just waits
 * it out instead of failing on the intermediate URL.
 */
export async function expectPrivateUrl(page: Page, pattern: RegExp, timeout = 120_000): Promise<void> {
  await expect(page).toHaveURL(pattern, { timeout });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The app's modals render as a single `role="dialog"`; scoping to it keeps the
 * amount keypad apart from same-named controls on the screen behind it. */
export function dialog(page: Page) {
  return page.getByRole('dialog');
}

/** Type an amount on the modal keypad, digit by digit. */
export async function typeAmount(page: Page, amount: string): Promise<void> {
  const pad = dialog(page);
  for (const character of amount) {
    await pad.getByRole('button', { name: character, exact: true }).click();
  }
}

/** Clear the modal keypad. */
export async function clearAmount(page: Page, presses: number): Promise<void> {
  const remove = dialog(page).getByRole('button', { name: 'delete' });
  for (let i = 0; i < presses; i += 1) await remove.click();
}

/**
 * A wallet without a nickname is held on the "Choose your username" screen
 * before it can reach any private route. When that screen is up, pick a
 * unique handle so the flow under test can proceed; return whether it ran.
 */
export async function completeUsernamePromptIfShown(page: Page, handle = uniqueHandle()): Promise<boolean> {
  const heading = page.getByRole('heading', { name: 'Choose your username' });
  const homeDeposit = page.getByRole('button', { name: 'Deposit' });
  await expect(heading.or(homeDeposit).first()).toBeVisible({ timeout: 60_000 });
  if (!(await heading.isVisible())) return false;

  // The prompt's visible "Username" label is not tied to the input, so the placeholder is the stable handle.
  const input = page.getByPlaceholder('username', { exact: true });
  await input.fill(handle);
  await expect(page.getByText(`@${handle} is available`)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Username saved')).toBeVisible();
  await expect(heading).toBeHidden({ timeout: 30_000 });
  return true;
}

/**
 * `[a-z0-9]`, unique per run, within the 3-15 character window the API accepts
 * for a new vaquitatag. The underscore that used to prefix these is no longer a
 * legal character, and the cap dropped from 32 to 15.
 */
export function uniqueHandle(): string {
  return `e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`.slice(0, 15);
}

/** Parse `Available: $12.3456789` → 12.3456789. */
export function parseAvailable(text: string): number {
  const match = text.replace(/,/g, '').match(/\$\s*([\d.]+)/);
  return match ? Number(match[1]) : NaN;
}

type Fixtures = {
  /** The funded account from `E2E_STELLAR_SECRET`. */
  signer: Signer;
  /** A page already signed in as `signer`, on `/home`, past the username prompt. */
  homePage: Page;
};

export const test = base.extend<Fixtures>({
  signer: async ({}, use) => {
    await use(primaryStellarSigner());
  },
  homePage: async ({ page, signer }, use) => {
    await primePage(page, signer);
    await openSignedIn(page, '/home');
    await completeUsernamePromptIfShown(page);
    await expect(page.getByRole('button', { name: 'Deposit' })).toBeVisible({ timeout: 60_000 });
    await use(page);
  },
});

export { expect };

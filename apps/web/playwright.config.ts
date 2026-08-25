import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the SCF critical-flow suite (`e2e/*.spec.ts`).
 *
 * The app under test is started on port 3101 with `E2E_TEST_SIGNER=1`, which
 * makes `next.config.ts` alias `@pollar/react` to `e2e/shim/pollar-react.tsx`
 * so the browser logs in with the keypair in `E2E_STELLAR_SECRET` instead of
 * Pollar's hosted modal. See `e2e/README.md` for the full variable list.
 *
 * Specs talk to a live testnet and a live API, so they run serially in one
 * worker: two specs moving the same wallet's funds at once would race on
 * sequence numbers and on the positions the API reports.
 */

const CI = !!process.env.CI;
const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * `E2E_*` values from `apps/web/.env.e2e`, so a local run does not depend on
 * what the current shell happens to export. Anything already in the
 * environment wins, which keeps CI's secrets and one-off overrides authoritative.
 *
 * The file is git-ignored (the root `.gitignore` covers `.env.**`) because it
 * holds a testnet secret key; `e2e/README.md` carries the template.
 */
function loadE2EEnvFile(): void {
  let contents: string;
  try {
    contents = readFileSync(path.join(__dirname, '.env.e2e'), 'utf8');
  } catch {
    return; // No file: the shell (or CI) is the only source.
  }
  for (const line of contents.split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadE2EEnvFile();

// Only variables that are actually set are forwarded, so an unset one still
// falls through to the app's own `.env*` files (the local workflow) while CI
// can inject every value from secrets.
const webServerEnv: Record<string, string> = { E2E_TEST_SIGNER: '1' };
const forward: Array<[from: string, to: string]> = [
  ['E2E_SERVICES_URL', 'NEXT_PUBLIC_SERVICES_URL'],
  ['E2E_POLLAR_PUBLISHABLE_KEY', 'NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY'],
];
for (const [from, to] of forward) {
  const value = process.env[from];
  if (value) webServerEnv[to] = value;
}

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // Every spec waits on real ledgers (5s close time) and a real API.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'e2e-results/junit.xml' }],
    ['json', { outputFile: 'e2e-results/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The app is bilingual; specs assert on the English copy.
    locale: 'en-US',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  // Chromium alone by default: every browser listed here is another full pass
  // of the suite, and the on-chain specs would move real testnet funds once per
  // pass with the same wallet. `E2E_ALL_BROWSERS=1` adds the other two for a
  // deliberate cross-browser run; `--project=firefox` still selects one of them.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env.E2E_ALL_BROWSERS === '1'
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
  webServer: {
    // CI builds first (`E2E_TEST_SIGNER=1 next build`, see .github/workflows/e2e.yml)
    // and serves the optimized output; locally the dev server compiles on demand.
    command: CI ? `pnpm exec next start -p ${PORT}` : `pnpm exec next dev --turbopack -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: webServerEnv,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { prisma } from '@vaquita/db';
import {
  getWalletBalancesFreshness,
  refreshWalletBalances,
} from '@vaquita/shared/services/wallets/onchainBalances';

import { logger } from './logger';

// Scheduled refresh of `wallet_balances`, the snapshot the admin dashboard ranks
// top DeFindex passive-yield depositors from. Lives in the reconciler workspace
// because that is where the repo keeps scheduled maintenance jobs, and because
// its logger deliberately avoids the API's env validation: this job needs
// DATABASE_URL and the Stellar RPC config, nothing else.
//
// The read work itself is in @vaquita/shared, shared with the admin panel's
// Scrape button, so the two cannot drift apart.

type CliOptions = {
  /** Wallets per shared-service call. Bigger = fewer round trips, same RPC rate. */
  pageSize: number;
  /** Hard cap on wallets touched in one run; 0 means "sweep everything". */
  limit: number;
  /** Resume point for a sweep that ran out of budget last time. */
  afterProfileId: number | null;
  /** Wall-clock budget in seconds. The sweep stops cleanly and reports where. */
  maxSeconds: number;
  artifactPath: string | null;
};

const readFlag = (name: string): string | null => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? null;
  return null;
};

const readNonNegativeInteger = (name: string, fallback: number, envName: string): number => {
  const value = readFlag(name) ?? process.env[envName];
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
};

const loadDotEnvIfPresent = (): void => {
  try {
    process.loadEnvFile();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }
};

const resolveOptions = (): CliOptions => ({
  pageSize: Math.max(1, readNonNegativeInteger('page-size', 50, 'WALLET_REFRESH_PAGE_SIZE')),
  limit: readNonNegativeInteger('limit', 0, 'WALLET_REFRESH_LIMIT'),
  afterProfileId: readFlag('after-profile-id') ? readNonNegativeInteger('after-profile-id', 0, '') : null,
  maxSeconds: Math.max(60, readNonNegativeInteger('max-seconds', 3000, 'WALLET_REFRESH_MAX_SECONDS')),
  artifactPath: readFlag('artifact'),
});

const emitArtifact = (artifactPath: string | null, artifact: Record<string, unknown>): void => {
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  if (artifactPath) {
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, json, 'utf8');
    console.error(`wallet balance artifact written: ${artifactPath}`);
  }
  process.stdout.write(json);
};

const baseArtifact = () => ({
  workflow_name: 'refresh-wallet-balances',
  environment: process.env.GITHUB_ENVIRONMENT ?? process.env.NODE_ENV ?? 'local',
  commit_sha: process.env.GITHUB_SHA ?? null,
  run_id: process.env.GITHUB_RUN_ID ?? null,
  actor: process.env.GITHUB_ACTOR ?? process.env.USER ?? null,
});

const main = async () => {
  loadDotEnvIfPresent();
  const options = resolveOptions();

  const startedAt = Date.now();
  const deadline = startedAt + options.maxSeconds * 1000;
  // Checked between wallets, so a run that overruns its budget stops on a whole
  // wallet and hands the next run a resume point instead of being killed.
  const shouldStop = () => Date.now() >= deadline;

  let cursor = options.afterProfileId;
  let wallets = 0;
  let rows = 0;
  let failed = 0;
  let total = 0;
  let stopped = false;
  let pages = 0;

  for (;;) {
    // `limit: 0` means sweep everything; otherwise never read past the cap.
    const remaining = options.limit > 0 ? options.limit - wallets : options.pageSize;
    if (remaining <= 0) break;

    const batch = await refreshWalletBalances({
      limit: Math.min(options.pageSize, remaining),
      ...(cursor === null ? {} : { afterProfileId: cursor }),
      shouldStop,
    });

    pages += 1;
    total = batch.total;
    rows += batch.results.length;
    failed += batch.results.filter((r) => r.lastError !== null).length;
    wallets += new Set(batch.results.map((r) => r.wallet)).size;

    logger.info(
      {
        event: 'wallet_balance_page',
        page: pages,
        wallets,
        rows,
        failed,
        total,
        next_profile_id: batch.nextProfileId,
      },
      'wallet balance page done',
    );

    if (batch.stopped) {
      stopped = true;
      cursor = batch.nextProfileId;
      break;
    }
    if (batch.nextProfileId === null) {
      cursor = null;
      break;
    }
    cursor = batch.nextProfileId;
  }

  const freshness = await getWalletBalancesFreshness();

  emitArtifact(options.artifactPath, {
    ...baseArtifact(),
    phase: 'wallet_balance_refresh',
    skipped: false,
    // A truthy `next_profile_id` is the resume point: pass it back as
    // --after-profile-id to continue where the budget ran out.
    stopped_early: stopped,
    next_profile_id: cursor,
    duration_seconds: Math.round((Date.now() - startedAt) / 1000),
    profiles_total: total,
    wallets_scraped: wallets,
    rows_written: rows,
    rows_failed: failed,
    snapshot_scraped_at: freshness.scrapedAt,
    snapshot_rows: freshness.rows,
    snapshot_errored: freshness.errored,
  });
};

let exitCode = 0;

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
  process.exit(exitCode);
}

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { rpc } from '@stellar/stellar-sdk';
import { prisma } from '@vaquita/db';
import { getProjectConfig } from '@vaquita/shared/services/project-config/index';
import { passphraseForNetwork } from '@vaquita/shared/services/stellar/passphrase';
import { requireSorobanRpcUrl } from '@vaquita/shared/services/stellar/rpc';
import {
  createPrismaReconciliationDependencies,
  resolveReconciliationLedgerRange,
  runReconciliation,
  type RawReconciliationEvent,
  type ReconciliationEventPage,
  type ReconciliationRunInput,
} from '@vaquita/shared/services/reconciliation/index';

import { logger } from './logger';

type CliOptions = {
  fromLedger: number | null;
  toLedger: number | null;
  network: string;
  dryRun: boolean;
  advanceCursor: boolean;
  job: string;
  rpcUrl: string;
  networkPassphrase: string;
  contractIds: string[];
  overlapLedgers: number;
  fallbackLookbackLedgers: number;
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

const readBoolean = (name: string, fallback: boolean): boolean => {
  const value = readFlag(name);
  if (value === null) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`--${name} must be true or false`);
};

const readLedger = (name: string): number => {
  const value = readFlag(name);
  const parsed = value ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
};

const readOptionalLedger = (name: string): number | null => {
  const value = readFlag(name);
  if (value === null) return null;
  return readLedger(name);
};

const readPositiveInteger = (name: string, fallback: number, envName?: string): number => {
  const value = readFlag(name) ?? (envName ? process.env[envName] : process.env[name.replaceAll('-', '_').toUpperCase()]);
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
};

const splitList = (value: string | null | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const firstNonEmptyList = (...values: string[][]): string[] => values.find((items) => items.length > 0) ?? [];

const inferNetwork = (): string => {
  const explicit = readFlag('network') ?? process.env.RECONCILIATION_NETWORK;
  if (explicit) return explicit;

  const lifecycle = process.env.npm_lifecycle_event ?? '';
  const [, suffix] = lifecycle.split(':');
  return suffix || 'mainnet';
};

const loadDotEnvIfPresent = (): void => {
  try {
    process.loadEnvFile();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }
};

const resolveOptions = async (): Promise<CliOptions> => {
  const network = inferNetwork();
  const rpcUrl =
    readFlag('rpc-url') ??
    requireSorobanRpcUrl(network === 'mainnet' ? 'mainnet' : 'testnet');

  const explicitContractIds = splitList(readFlag('pool-contract-id'));
  const envContractIds = splitList(process.env.VAQUITA_POOL_CONTRACT_IDS);
  const envSingleContractId = splitList(process.env.VAQUITA_POOL_CONTRACT_ID);
  const needsProjectConfig =
    explicitContractIds.length === 0 ||
    (!readFlag('network-passphrase') && !process.env.STELLAR_NETWORK_PASSPHRASE && !process.env.STELLAR_NETWORK);
  const projectConfig = needsProjectConfig ? await getProjectConfig() : null;
  const projectContractIds = projectConfig?.tokens.map((token) => token.vaquitaContractAddress).filter(Boolean) ?? [];
  const contractIds = firstNonEmptyList(
    explicitContractIds,
    envContractIds,
    envSingleContractId,
    projectContractIds,
  );

  const networkPassphrase =
    readFlag('network-passphrase') ??
    process.env.STELLAR_NETWORK_PASSPHRASE ??
    passphraseForNetwork(process.env.STELLAR_NETWORK) ??
    projectConfig?.networkPassphrase ??
    '';

  if (contractIds.length === 0) {
    throw new Error(
      'No VaquitaPool contract ID configured. Provide --pool-contract-id, VAQUITA_POOL_CONTRACT_ID(S), or project config token vaquitaContractAddress.',
    );
  }
  if (!networkPassphrase) {
    throw new Error('Missing network passphrase. Provide --network-passphrase, STELLAR_NETWORK (mainnet|testnet), or project config.');
  }

  const fromLedger = readOptionalLedger('start-ledger') ?? readOptionalLedger('from-ledger');
  const toLedger = readOptionalLedger('end-ledger') ?? readOptionalLedger('to-ledger');
  if (fromLedger !== null && toLedger !== null && toLedger < fromLedger) {
    throw new Error('--end-ledger/--to-ledger must be greater than or equal to --start-ledger/--from-ledger');
  }

  return {
    fromLedger,
    toLedger,
    network,
    dryRun: readBoolean('dry-run', true),
    advanceCursor: readBoolean('advance-cursor', false),
    job: readFlag('job') ?? process.env.RECONCILIATION_JOB ?? `${network}-pool-events`,
    rpcUrl,
    networkPassphrase,
    contractIds,
    overlapLedgers: readPositiveInteger('overlap-ledgers', 20, 'RECONCILIATION_OVERLAP_LEDGERS'),
    fallbackLookbackLedgers: readPositiveInteger('fallback-lookback-ledgers', 500, 'RECONCILIATION_FALLBACK_LOOKBACK_LEDGERS'),
    artifactPath: readFlag('artifact') ?? process.env.RECONCILIATION_ARTIFACT_PATH ?? null,
  };
};

const HEALTH_RETRY_ATTEMPTS = 3;
const HEALTH_RETRY_DELAY_MS = 15_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// stellar-sdk rethrows JSON-RPC error payloads verbatim, so these are plain
// { code, message } objects rather than Error instances.
const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
};

// stellar-rpc fails getHealth when its last ingested ledger is older than the
// node's max healthy latency (30s by default). The node is lagging behind the
// network, not broken — a later ledger close normally clears it.
const isLedgerLatencyError = (error: unknown): boolean =>
  /since last known ledger closed is too high/i.test(errorMessage(error));

const fetchLedgerBounds = async (rpcUrl: string): Promise<{ oldestLedger: number; latestLedger: number }> => {
  const server = new rpc.Server(rpcUrl);

  for (let attempt = 1; ; attempt += 1) {
    try {
      const health = await server.getHealth();
      return {
        oldestLedger: Number(health.oldestLedger),
        latestLedger: Number(health.latestLedger),
      };
    } catch (error: unknown) {
      if (attempt >= HEALTH_RETRY_ATTEMPTS || !isLedgerLatencyError(error)) throw error;
      logger.warn(
        {
          event: 'reconciliation_rpc_health_retry',
          attempt,
          max_attempts: HEALTH_RETRY_ATTEMPTS,
          retry_delay_ms: HEALTH_RETRY_DELAY_MS,
          error: errorMessage(error),
        },
        'RPC reported a lagging ledger — retrying health probe',
      );
      await sleep(HEALTH_RETRY_DELAY_MS);
    }
  }
};

/** Events per page. The RPC's own ledger scan budget usually ends a page first. */
const EVENT_PAGE_LIMIT = 200;

/**
 * Safety stop for the pagination loop. The RPC scans roughly 10_000 ledgers per
 * call, so this covers about 2M ledgers — far past the ~121k of RPC retention.
 * Hitting it means something is wrong, and the run reports a short read rather
 * than pretending it covered the window.
 */
const MAX_EVENT_PAGES = 200;

/**
 * The ledger a Soroban event cursor sits at: the high 32 bits of the TOID in
 * `<toid>-<eventIndex>`. The RPC returns a cursor even for a page that matched
 * nothing, and it marks where the scan stopped rather than where the last event
 * was — which is exactly the "how far did we actually get" the cursor needs.
 */
const cursorLedger = (cursor: string): number | null => {
  const [toid] = cursor.split('-');
  if (!toid) return null;
  try {
    return Number(BigInt(toid) >> 32n);
  } catch {
    return null;
  }
};

/**
 * Every event the pool emitted in the range, paging until the window is
 * exhausted.
 *
 * One `getEvents` call does NOT cover an arbitrary range: the RPC scans a
 * bounded number of ledgers (~10_000, about twelve hours of mainnet) and hands
 * back a cursor for the rest. Reading only the first page while reporting the
 * full range is what let a withdraw from this morning sit unseen behind a cursor
 * that had been advanced past it.
 *
 * `startLedger`/`endLedger` and `cursor` are mutually exclusive on the RPC, so
 * only the first call carries the range and every later page is bounded here.
 */
const fetchEvents = (rpcUrl: string) => async (input: ReconciliationRunInput): Promise<ReconciliationEventPage> => {
  const server = new rpc.Server(rpcUrl);
  const collected: RawReconciliationEvent[] = [];
  const filters = [{ type: 'contract' as const, contractIds: input.contractIds }];

  let cursor: string | null = null;
  let scannedThroughLedger = input.startLedger;
  let pages = 0;

  while (pages < MAX_EVENT_PAGES) {
    const response = await server.getEvents(
      cursor
        ? { filters, limit: EVENT_PAGE_LIMIT, cursor }
        : { filters, limit: EVENT_PAGE_LIMIT, startLedger: input.startLedger, endLedger: input.endLedger },
    );
    pages += 1;

    for (const event of response.events ?? []) {
      const ledger = Number(event.ledger);
      if (ledger > input.endLedger) continue;
      const raw: RawReconciliationEvent = {
        id: event.id,
        ledger,
        txHash: event.txHash,
        topic: event.topic,
        value: event.value,
      };
      if (event.ledgerClosedAt) raw.ledgerClosedAt = event.ledgerClosedAt;
      if (event.contractId) raw.contractId = String(event.contractId);
      collected.push(raw);
    }

    const next = response.cursor ?? null;
    // No cursor at all: the RPC has nothing further to offer in this window.
    if (!next) {
      scannedThroughLedger = input.endLedger;
      break;
    }

    const reached = cursorLedger(next);
    if (reached === null) {
      // Cursor we cannot read. Claim only what the events themselves prove.
      const lastLedger = collected.at(-1)?.ledger;
      if (typeof lastLedger === 'number') scannedThroughLedger = Math.max(scannedThroughLedger, lastLedger);
      logger.warn(
        { event: 'reconciliation_events_cursor_unreadable', job: input.job, cursor: next, pages },
        'could not read the ledger out of the event cursor — stopping the page walk short',
      );
      break;
    }

    if (reached >= input.endLedger) {
      scannedThroughLedger = input.endLedger;
      break;
    }

    scannedThroughLedger = Math.max(scannedThroughLedger, reached);
    cursor = next;
  }

  if (pages >= MAX_EVENT_PAGES && scannedThroughLedger < input.endLedger) {
    logger.warn(
      {
        event: 'reconciliation_events_page_cap',
        job: input.job,
        pages,
        start_ledger: input.startLedger,
        end_ledger: input.endLedger,
        scanned_through_ledger: scannedThroughLedger,
      },
      'event pagination stopped at the page cap — the cursor will only claim the ledgers actually read',
    );
  }

  logger.info(
    {
      event: 'reconciliation_events_fetched',
      job: input.job,
      pages,
      events: collected.length,
      start_ledger: input.startLedger,
      end_ledger: input.endLedger,
      scanned_through_ledger: scannedThroughLedger,
    },
    'fetched pool events',
  );

  return { events: collected, scannedThroughLedger };
};

const baseArtifact = (options: CliOptions): Record<string, unknown> => ({
  workflow_name: `local-reconcile-${options.network}`,
  environment: process.env.GITHUB_ENVIRONMENT ?? process.env.NODE_ENV ?? 'local',
  network: options.network,
  network_passphrase: options.networkPassphrase,
  commit_sha: process.env.GITHUB_SHA ?? null,
  run_id: process.env.GITHUB_RUN_ID ?? null,
  actor: process.env.GITHUB_ACTOR ?? process.env.USER ?? null,
});

const emitArtifact = (artifactPath: string | null, artifact: Record<string, unknown>): void => {
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  if (artifactPath) {
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, json, 'utf8');
    console.error(`reconciliation artifact written: ${artifactPath}`);
  }
  process.stdout.write(json);
};

const main = async () => {
  loadDotEnvIfPresent();
  const options = await resolveOptions();

  // Probe the RPC before touching the database so a skipped run costs no queries.
  let bounds: { oldestLedger: number; latestLedger: number };
  try {
    bounds = await fetchLedgerBounds(options.rpcUrl);
  } catch (error: unknown) {
    if (!isLedgerLatencyError(error)) throw error;
    // Soft skip: the cursor is untouched and overlapLedgers makes the next run
    // re-scan this window, so a lagging RPC must not fail the scheduled job.
    logger.warn(
      {
        event: 'reconciliation_skipped_rpc_lagging',
        job: options.job,
        network: options.network,
        attempts: HEALTH_RETRY_ATTEMPTS,
        error: errorMessage(error),
      },
      'RPC still lagging after retries — skipping this run; the next run re-scans the gap',
    );
    emitArtifact(options.artifactPath, {
      ...baseArtifact(options),
      phase: 'reconciliation_skipped',
      job: options.job,
      skipped: true,
      skip_reason: 'rpc_ledger_latency',
      skip_message: errorMessage(error),
    });
    return;
  }

  const { oldestLedger, latestLedger } = bounds;
  const deps = createPrismaReconciliationDependencies(prisma);
  const cursorState = await deps.loadState();
  const range = resolveReconciliationLedgerRange({
    state: cursorState,
    job: options.job,
    contractIds: options.contractIds,
    latestLedger,
    oldestLedger,
    overlapLedgers: options.overlapLedgers,
    fallbackLookbackLedgers: options.fallbackLookbackLedgers,
    ...(options.fromLedger !== null ? { fromLedger: options.fromLedger } : {}),
    ...(options.toLedger !== null ? { toLedger: options.toLedger } : {}),
  });

  if (range.clamped) {
    logger.warn(
      {
        event: 'reconciliation_range_clamped',
        job: options.job,
        network: options.network,
        range_source: range.source,
        oldest_ledger: oldestLedger,
        latest_ledger: latestLedger,
        requested_start_ledger: range.requestedStartLedger,
        requested_end_ledger: range.requestedEndLedger,
        start_ledger: range.startLedger,
        end_ledger: range.endLedger,
        skipped_ledgers: Math.max(0, range.startLedger - range.requestedStartLedger),
      },
      'reconciliation range clamped to RPC retention window — skipped ledgers are unrecoverable from RPC events',
    );
  }

  const result = await runReconciliation(
    {
      job: options.job,
      contractIds: options.contractIds,
      startLedger: range.startLedger,
      endLedger: range.endLedger,
      dryRun: options.dryRun,
      advanceCursor: options.advanceCursor,
    },
    {
      ...deps,
      fetchEvents: fetchEvents(options.rpcUrl),
    },
  );

  if (result.scannedThroughLedger < range.endLedger) {
    logger.warn(
      {
        event: 'reconciliation_range_short_read',
        job: options.job,
        network: options.network,
        start_ledger: range.startLedger,
        end_ledger: range.endLedger,
        scanned_through_ledger: result.scannedThroughLedger,
        unread_ledgers: range.endLedger - result.scannedThroughLedger,
        cursor_behavior: result.cursorBehavior,
      },
      'event fetch stopped before the end of the range — the cursor only advances to what was read, so the rest is retried next run',
    );
  }

  const artifact = {
    ...baseArtifact(options),
    phase: options.dryRun ? 'reconciliation_dry_run' : 'reconciliation_repair',
    skipped: false,
    range_source: range.source,
    range_clamped: range.clamped,
    requested_start_ledger: range.requestedStartLedger,
    requested_end_ledger: range.requestedEndLedger,
    oldest_ledger: oldestLedger,
    latest_ledger: latestLedger,
    overlap_ledgers: options.overlapLedgers,
    fallback_lookback_ledgers: options.fallbackLookbackLedgers,
    ...result,
  };

  emitArtifact(options.artifactPath, artifact);
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

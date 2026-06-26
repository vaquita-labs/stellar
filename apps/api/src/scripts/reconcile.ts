import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { rpc } from '@stellar/stellar-sdk';
import { prisma } from '@vaquita/db';
import { getProjectConfig } from '@vaquita/shared/services/project-config/index';
import {
  createPrismaReconciliationDependencies,
  resolveReconciliationLedgerRange,
  runReconciliation,
  type RawReconciliationEvent,
  type ReconciliationRunInput,
} from '@vaquita/shared/services/reconciliation/index';

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
  const rpcUrl =
    readFlag('rpc-url') ??
    process.env.STELLAR_RPC_URL ??
    process.env.MAINNET_STELLAR_RPC_URL ??
    '';

  const explicitContractIds = splitList(readFlag('pool-contract-id'));
  const envContractIds = splitList(process.env.VAQUITA_POOL_CONTRACT_IDS);
  const envSingleContractId = splitList(process.env.VAQUITA_POOL_CONTRACT_ID);
  const needsProjectConfig =
    explicitContractIds.length === 0 ||
    (!readFlag('network-passphrase') && !process.env.STELLAR_NETWORK_PASSPHRASE);
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
    projectConfig?.networkPassphrase ??
    '';

  if (contractIds.length === 0) {
    throw new Error(
      'No VaquitaPool contract ID configured. Provide --pool-contract-id, VAQUITA_POOL_CONTRACT_ID(S), or project config token vaquitaContractAddress.',
    );
  }
  if (!rpcUrl) {
    throw new Error('Missing Stellar RPC URL. Provide --rpc-url, STELLAR_RPC_URL, or MAINNET_STELLAR_RPC_URL.');
  }
  if (!networkPassphrase) {
    throw new Error('Missing network passphrase. Provide --network-passphrase, STELLAR_NETWORK_PASSPHRASE, or project config.');
  }

  const fromLedger = readOptionalLedger('start-ledger') ?? readOptionalLedger('from-ledger');
  const toLedger = readOptionalLedger('end-ledger') ?? readOptionalLedger('to-ledger');
  if (fromLedger !== null && toLedger !== null && toLedger < fromLedger) {
    throw new Error('--end-ledger/--to-ledger must be greater than or equal to --start-ledger/--from-ledger');
  }

  return {
    fromLedger,
    toLedger,
    network: inferNetwork(),
    dryRun: readBoolean('dry-run', true),
    advanceCursor: readBoolean('advance-cursor', false),
    job: readFlag('job') ?? process.env.RECONCILIATION_JOB ?? `${inferNetwork()}-pool-events`,
    rpcUrl,
    networkPassphrase,
    contractIds,
    overlapLedgers: readPositiveInteger('overlap-ledgers', 20, 'RECONCILIATION_OVERLAP_LEDGERS'),
    fallbackLookbackLedgers: readPositiveInteger('fallback-lookback-ledgers', 500, 'RECONCILIATION_FALLBACK_LOOKBACK_LEDGERS'),
    artifactPath: readFlag('artifact') ?? process.env.RECONCILIATION_ARTIFACT_PATH ?? null,
  };
};

const fetchLatestLedger = async (rpcUrl: string): Promise<number> => {
  const server = new rpc.Server(rpcUrl);
  const latest = await server.getLatestLedger();
  return Number(latest.sequence);
};

const fetchEvents = (rpcUrl: string) => async (input: ReconciliationRunInput): Promise<RawReconciliationEvent[]> => {
  const server = new rpc.Server(rpcUrl);
  const collected: RawReconciliationEvent[] = [];
  const response = await server.getEvents({
    startLedger: input.startLedger,
    endLedger: input.endLedger,
    filters: [{ type: 'contract', contractIds: input.contractIds }],
    limit: 10000,
  });

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

  return collected;
};

const main = async () => {
  loadDotEnvIfPresent();
  const options = await resolveOptions();
  const deps = createPrismaReconciliationDependencies(prisma);
  const cursorState = await deps.loadState();
  const latestLedger = options.toLedger ?? await fetchLatestLedger(options.rpcUrl);
  const range = resolveReconciliationLedgerRange({
    state: cursorState,
    job: options.job,
    contractIds: options.contractIds,
    latestLedger,
    overlapLedgers: options.overlapLedgers,
    fallbackLookbackLedgers: options.fallbackLookbackLedgers,
    ...(options.fromLedger !== null ? { fromLedger: options.fromLedger } : {}),
    ...(options.toLedger !== null ? { toLedger: options.toLedger } : {}),
  });

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

  const artifact = {
    workflow_name: `local-reconcile-${options.network}`,
    phase: options.dryRun ? 'reconciliation_dry_run' : 'reconciliation_repair',
    environment: process.env.GITHUB_ENVIRONMENT ?? process.env.NODE_ENV ?? 'local',
    network: options.network,
    network_passphrase: options.networkPassphrase,
    commit_sha: process.env.GITHUB_SHA ?? null,
    run_id: process.env.GITHUB_RUN_ID ?? null,
    actor: process.env.GITHUB_ACTOR ?? process.env.USER ?? null,
    range_source: range.source,
    latest_ledger: latestLedger,
    overlap_ledgers: options.overlapLedgers,
    fallback_lookback_ledgers: options.fallbackLookbackLedgers,
    ...result,
  };

  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  if (options.artifactPath) {
    mkdirSync(dirname(options.artifactPath), { recursive: true });
    writeFileSync(options.artifactPath, json, 'utf8');
    console.error(`reconciliation artifact written: ${options.artifactPath}`);
  }
  process.stdout.write(json);
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

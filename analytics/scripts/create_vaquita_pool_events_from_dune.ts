#!/usr/bin/env node
/**
 * Build a clean Dune upload table `vaquita_pool_events` from the existing
 * `vaquita_events` upload table, enriching historical deposit/withdraw rows
 * with `lock_period` from the Vaquita Postgres/Supabase database.
 *
 * This is a one-off migration/backfill companion to the live ingest script.
 * It does not mutate `vaquita_events`; it creates or clears `vaquita_pool_events`
 * and inserts one canonical row per `event_id`.
 *
 * Required env:
 *   DUNE_API_KEY
 *   DUNE_NAMESPACE=vaquitaprotocol0178
 *   DATABASE_URL
 *
 * Optional env:
 *   DUNE_SOURCE_TABLE=vaquita_events
 *   DUNE_TARGET_TABLE=vaquita_pool_events
 *   DUNE_PERFORMANCE=small
 *
 * Usage:
 *   pnpm --filter vaquita-analytics create:pool-events -- --dry-run
 *   pnpm --filter vaquita-analytics create:pool-events -- --replace
 */

import "dotenv/config";

import { prisma } from "@vaquita/db";

type DuneColumnType = "varchar" | "integer" | "double" | "boolean" | "timestamp";

type Args = {
  dryRun: boolean;
  replace: boolean;
  limit?: number;
};

type DuneValue = string | number | boolean | null | undefined;

type SourceRow = {
  environment: string;
  event_id: string;
  ledger: number;
  ledger_closed_at: string;
  contract_id: string;
  event_type: string;
  tx_hash: string;
  event_name: string;
  caller: string;
  deposit_id: string;
  amount: number | null;
  reward: number | null;
  early_fee: number | null;
  matured: boolean | null;
  topics_json: string;
  value_json: string;
};

type TargetRow = SourceRow & {
  lock_period: number | "";
};

type SchemaColumn = {
  name: string;
  type: DuneColumnType;
  nullable?: boolean;
};

type ExecuteSqlResponse = {
  execution_id: string;
  state: string;
};

type ExecutionResultResponse = {
  is_execution_finished?: boolean;
  state?: string;
  error?: { message?: string };
  result?: {
    metadata?: {
      row_count?: number;
      total_row_count?: number;
    };
    rows?: Record<string, DuneValue>[];
  };
};

const DUNE_API_KEY = process.env.DUNE_API_KEY ?? "";
const DUNE_NAMESPACE = process.env.DUNE_NAMESPACE ?? "vaquitaprotocol0178";
const SOURCE_TABLE = process.env.DUNE_SOURCE_TABLE ?? "vaquita_events";
const TARGET_TABLE = process.env.DUNE_TARGET_TABLE ?? "vaquita_pool_events";
const DUNE_PERFORMANCE = process.env.DUNE_PERFORMANCE ?? "small";

const DUNE_API_BASE = "https://api.dune.com/api/v1";
const PAGE_SIZE = 5000;

const COLUMNS = [
  "environment",
  "event_id",
  "ledger",
  "ledger_closed_at",
  "contract_id",
  "event_type",
  "tx_hash",
  "event_name",
  "caller",
  "deposit_id",
  "amount",
  "lock_period",
  "reward",
  "early_fee",
  "matured",
  "topics_json",
  "value_json",
] as const;

const SCHEMA: SchemaColumn[] = [
  { name: "environment", type: "varchar", nullable: false },
  { name: "event_id", type: "varchar", nullable: false },
  { name: "ledger", type: "integer", nullable: false },
  { name: "ledger_closed_at", type: "timestamp", nullable: true },
  { name: "contract_id", type: "varchar", nullable: true },
  { name: "event_type", type: "varchar", nullable: true },
  { name: "tx_hash", type: "varchar", nullable: true },
  { name: "event_name", type: "varchar", nullable: true },
  { name: "caller", type: "varchar", nullable: true },
  { name: "deposit_id", type: "varchar", nullable: true },
  { name: "amount", type: "double", nullable: true },
  { name: "lock_period", type: "integer", nullable: true },
  { name: "reward", type: "double", nullable: true },
  { name: "early_fee", type: "double", nullable: true },
  { name: "matured", type: "boolean", nullable: true },
  { name: "topics_json", type: "varchar", nullable: true },
  { name: "value_json", type: "varchar", nullable: true },
];

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, replace: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--replace") args.replace = true;
    else if (arg === "--limit" && next) {
      args.limit = Number(next);
      i++;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Create ${TARGET_TABLE} from ${SOURCE_TABLE}, enriched with DB lock periods.

Options:
  --dry-run       Read Dune + DB, report enrichment stats, do not create/clear/insert.
  --replace       Clear target table before inserting. Required when rebuilding.
  --limit N       Limit source rows for a small test run.
  --help          Show this help.
`);
}

function requireEnv(): void {
  if (!DUNE_API_KEY) throw new Error("Set DUNE_API_KEY first.");
  if (!DUNE_NAMESPACE) throw new Error("Set DUNE_NAMESPACE first.");
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL first.");
}

function duneHeaders(contentType = "application/json"): Record<string, string> {
  return { "X-Dune-Api-Key": DUNE_API_KEY, "Content-Type": contentType };
}

async function duneJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${DUNE_API_BASE}${path}`, {
    ...init,
    headers: {
      ...duneHeaders(),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Dune ${path} failed HTTP ${res.status}: ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function executeSql(sql: string): Promise<string> {
  const body = await duneJson<ExecuteSqlResponse>("/sql/execute", {
    method: "POST",
    body: JSON.stringify({ sql, performance: DUNE_PERFORMANCE }),
  });
  return body.execution_id;
}

async function getExecutionPage(
  executionId: string,
  offset: number,
  limit: number,
): Promise<ExecutionResultResponse> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });
  return duneJson<ExecutionResultResponse>(`/execution/${executionId}/results?${params}`, {
    method: "GET",
  });
}

async function waitForExecution(executionId: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const page = await getExecutionPage(executionId, 0, 1);
    if (page.error) throw new Error(page.error.message ?? JSON.stringify(page.error));
    if (page.is_execution_finished || page.state === "QUERY_STATE_COMPLETED") return;
    if (page.state && page.state !== "QUERY_STATE_PENDING" && page.state !== "QUERY_STATE_EXECUTING") {
      throw new Error(`Dune execution ${executionId} ended in state ${page.state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(`Timed out waiting for Dune execution ${executionId}`);
}

async function fetchSourceRows(args: Args): Promise<SourceRow[]> {
  const limit = args.limit ? `LIMIT ${args.limit}` : "";
  const sql = `
    WITH ranked AS (
      SELECT
        environment,
        event_id,
        ledger,
        CAST(ledger_closed_at AS varchar) AS ledger_closed_at,
        contract_id,
        event_type,
        tx_hash,
        event_name,
        caller,
        deposit_id,
        amount,
        reward,
        early_fee,
        matured,
        topics_json,
        value_json,
        row_number() OVER (PARTITION BY event_id ORDER BY ledger) AS rn
      FROM dune.${DUNE_NAMESPACE}.${SOURCE_TABLE}
    )
    SELECT
      environment,
      event_id,
      ledger,
      ledger_closed_at,
      contract_id,
      event_type,
      tx_hash,
      event_name,
      caller,
      deposit_id,
      amount,
      reward,
      early_fee,
      matured,
      topics_json,
      value_json
    FROM ranked
    WHERE rn = 1
    ORDER BY ledger, event_id
    ${limit}
  `;

  const executionId = await executeSql(sql);
  await waitForExecution(executionId);

  const rows: SourceRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await getExecutionPage(executionId, offset, PAGE_SIZE);
    const pageRows = page.result?.rows ?? [];
    rows.push(...pageRows.map(toSourceRow));
    if (pageRows.length < PAGE_SIZE) break;
  }
  return rows;
}

function stringValue(value: DuneValue): string {
  return value == null ? "" : String(value);
}

function numberValue(value: DuneValue): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function booleanValue(value: DuneValue): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function toSourceRow(row: Record<string, DuneValue>): SourceRow {
  return {
    environment: stringValue(row.environment),
    event_id: stringValue(row.event_id),
    ledger: numberValue(row.ledger) ?? 0,
    ledger_closed_at: stringValue(row.ledger_closed_at),
    contract_id: stringValue(row.contract_id),
    event_type: stringValue(row.event_type),
    tx_hash: stringValue(row.tx_hash),
    event_name: stringValue(row.event_name),
    caller: stringValue(row.caller),
    deposit_id: stringValue(row.deposit_id),
    amount: numberValue(row.amount),
    reward: numberValue(row.reward),
    early_fee: numberValue(row.early_fee),
    matured: booleanValue(row.matured),
    topics_json: stringValue(row.topics_json),
    value_json: stringValue(row.value_json),
  };
}

type LockPeriodIndex = {
  byDepositTx: Map<string, number>;
  byWithdrawalTx: Map<string, number>;
  byUnambiguousDepositId: Map<string, number>;
};

function normalizeLockPeriodSeconds(lockPeriod: bigint | null): number | null {
  if (lockPeriod == null || lockPeriod <= 0n) return null;
  const seconds = lockPeriod >= 1_000_000n ? lockPeriod / 1000n : lockPeriod;
  return Number(seconds);
}

async function buildLockPeriodIndex(): Promise<LockPeriodIndex> {
  const deposits = await prisma.deposit.findMany({
    where: { deletedAt: null },
    select: {
      depositIdHex: true,
      transactionHash: true,
      lockPeriod: true,
      withdrawals: {
        where: { deletedAt: null },
        select: { transactionHash: true },
      },
    },
  });

  const byDepositTx = new Map<string, number>();
  const byWithdrawalTx = new Map<string, number>();
  const byDepositIdValues = new Map<string, Set<number>>();

  for (const deposit of deposits) {
    const lockPeriod = normalizeLockPeriodSeconds(deposit.lockPeriod);
    if (!lockPeriod) continue;

    if (deposit.transactionHash) byDepositTx.set(deposit.transactionHash, lockPeriod);
    if (deposit.depositIdHex) {
      const values = byDepositIdValues.get(deposit.depositIdHex) ?? new Set<number>();
      values.add(lockPeriod);
      byDepositIdValues.set(deposit.depositIdHex, values);
    }
    for (const withdrawal of deposit.withdrawals) {
      if (withdrawal.transactionHash) byWithdrawalTx.set(withdrawal.transactionHash, lockPeriod);
    }
  }

  const byUnambiguousDepositId = new Map<string, number>();
  for (const [depositIdHex, values] of byDepositIdValues) {
    if (values.size === 1) byUnambiguousDepositId.set(depositIdHex, [...values][0]!);
  }

  return { byDepositTx, byWithdrawalTx, byUnambiguousDepositId };
}

function enrichRows(rows: SourceRow[], index: LockPeriodIndex): {
  rows: TargetRow[];
  matched: number;
  unmatchedDeposits: number;
  unmatchedWithdrawals: number;
} {
  let matched = 0;
  let unmatchedDeposits = 0;
  let unmatchedWithdrawals = 0;

  const enriched = rows.map((row): TargetRow => {
    let lockPeriod: number | "" = "";

    if (row.event_name === "deposit") {
      lockPeriod =
        index.byDepositTx.get(row.tx_hash) ??
        index.byUnambiguousDepositId.get(row.deposit_id) ??
        "";
      if (lockPeriod === "") unmatchedDeposits++;
      else matched++;
    } else if (row.event_name === "withdraw") {
      lockPeriod =
        index.byWithdrawalTx.get(row.tx_hash) ??
        index.byUnambiguousDepositId.get(row.deposit_id) ??
        "";
      if (lockPeriod === "") unmatchedWithdrawals++;
      else matched++;
    }

    return { ...row, lock_period: lockPeriod };
  });

  return { rows: enriched, matched, unmatchedDeposits, unmatchedWithdrawals };
}

async function createTargetTable(): Promise<void> {
  const res = await fetch(`${DUNE_API_BASE}/uploads`, {
    method: "POST",
    headers: duneHeaders(),
    body: JSON.stringify({
      namespace: DUNE_NAMESPACE,
      table_name: TARGET_TABLE,
      description: "VaquitaPool events enriched with lock_period from the app database.",
      schema: SCHEMA,
      is_private: false,
    }),
  });

  const text = await res.text();
  if (res.status === 200 || res.status === 201) {
    console.log(`Created table dune.${DUNE_NAMESPACE}.${TARGET_TABLE}`);
    return;
  }
  if (res.status === 409) {
    console.log(`Table dune.${DUNE_NAMESPACE}.${TARGET_TABLE} already exists.`);
    return;
  }
  throw new Error(`Create table failed HTTP ${res.status}: ${text}`);
}

async function clearTargetTable(): Promise<void> {
  const res = await fetch(`${DUNE_API_BASE}/uploads/${DUNE_NAMESPACE}/${TARGET_TABLE}/clear`, {
    method: "POST",
    headers: duneHeaders(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Clear table failed HTTP ${res.status}: ${text}`);
  console.log(`Cleared dune.${DUNE_NAMESPACE}.${TARGET_TABLE}`);
}

async function insertRows(rows: TargetRow[]): Promise<void> {
  if (rows.length === 0) {
    console.log("No rows to insert.");
    return;
  }

  const res = await fetch(`${DUNE_API_BASE}/uploads/${DUNE_NAMESPACE}/${TARGET_TABLE}/insert`, {
    method: "POST",
    headers: duneHeaders("text/csv"),
    body: toCsv(rows),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Insert failed HTTP ${res.status}: ${text}`);
  console.log(`Inserted ${rows.length} rows into dune.${DUNE_NAMESPACE}.${TARGET_TABLE}`);
}

function csvField(value: DuneValue): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: TargetRow[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((column) => csvField(row[column])).join(","));
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  requireEnv();

  console.log(`Source: dune.${DUNE_NAMESPACE}.${SOURCE_TABLE}`);
  console.log(`Target: dune.${DUNE_NAMESPACE}.${TARGET_TABLE}`);
  console.log(`Mode: ${args.dryRun ? "dry-run" : args.replace ? "replace" : "insert-only"}`);

  const [sourceRows, lockPeriodIndex] = await Promise.all([
    fetchSourceRows(args),
    buildLockPeriodIndex(),
  ]);
  const result = enrichRows(sourceRows, lockPeriodIndex);

  const depositRows = sourceRows.filter((row) => row.event_name === "deposit").length;
  const withdrawRows = sourceRows.filter((row) => row.event_name === "withdraw").length;

  console.log({
    sourceRows: sourceRows.length,
    depositRows,
    withdrawRows,
    matchedDepositOrWithdrawRows: result.matched,
    unmatchedDeposits: result.unmatchedDeposits,
    unmatchedWithdrawals: result.unmatchedWithdrawals,
  });

  if (args.dryRun) return;

  await createTargetTable();
  if (args.replace) await clearTargetTable();
  await insertRows(result.rows);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

#!/usr/bin/env node
/**
 * VaquitaPool (Stellar testnet) -> Dune table, INCREMENTAL / APPEND mode.
 *
 * MULTI-ENVIRONMENT: ingests several VaquitaPool deployments (dev, stage, …)
 * into ONE Dune table. Every row carries an `environment` label and the raw
 * `contract_id`, so the dashboard filters with `WHERE environment = 'dev'`.
 * Each environment tracks its own ingest cursor independently.
 *
 * Tailored to the VaquitaPool contract's events:
 *   deposit   topic ("deposit", caller)   data { deposit_id, token, amount, shares, lock_period? }
 *   withdraw  topic ("withdraw", caller)   data { deposit_id, token, amount, reward, early_fee, matured }
 *   fees_wth  topic ("fees_wth",)          data { admin, amount }      (penalties swept)
 *   (plus init, rewards, fee_upd, lp_add, lp_rm, upg_*, etc. — captured generically)
 *
 * Shapes each event into typed columns so the dashboard SQL is trivial:
 *   environment, event_name, caller, deposit_id, amount, reward, lock_period (+ raw topics/value json).
 *
 * WHY THIS EXISTS: Dune indexes Stellar MAINNET only — there is no testnet in its
 * catalog. So a testnet contract must be ingested via Dune "bring your own data".
 *
 * RETENTION: testnet RPC keeps only ~24h (max 7d) of events. This job runs
 * every 5 minutes via GitHub Actions so nothing ages out before ingest.
 *
 * ENDPOINTS: create = POST /v1/uploads (no /create suffix); insert =
 * POST /v1/uploads/:namespace/:table/insert. The legacy /v1/table/* paths
 * are deprecated and removed after 2026-03-01.
 *
 * REQUIRES: Node 18+ (built-in fetch). Run:  npx tsx stellar_testnet_to_dune_vaquita_pool_events.ts
 *
 * USAGE: put these in analytics/.env (auto-loaded via dotenv) or export them;
 * CI passes them as real env vars (no .env present, dotenv is a no-op there):
 *   DUNE_API_KEY="..."                       # dune.com -> Settings -> API
 *   DUNE_NAMESPACE="vaquitaprotocol"         # your Dune user/team handle
 *   VAQUITA_CONTRACTS="dev=C...,stage=C..."  # env=contractId, comma-separated
 *   DUNE_REFRESH_QUERY_IDS="123,456,..."     # optional: dashboard query IDs to re-run after an insert
 *   DUNE_REFRESH_DELAY_MS="60000"            # optional: delay between query refreshes
 *   npx tsx stellar_testnet_to_dune_vaquita_pool_events.ts
 */

import "dotenv/config"; // load analytics/.env before reading process.env (no-op if absent, e.g. in CI)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import process from "node:process";

// ----------------------------- CONFIG ----------------------------------------
const RPC_URL = process.env.VAQUITA_RPC_URL ?? "https://soroban-testnet.stellar.org";
const TABLE_NAME = "vaquita_pool_events"; // queryable as dune.<namespace>.vaquita_pool_events
const STATE_FILE = "dune_ingest_state.json";
const PAGE_LIMIT = 200;
const DECIMALS = 7; // Stellar assets use 7 decimals; confirm against your blend_token.

/** One deployed VaquitaPool instance to ingest. */
interface ContractCfg {
  environment: string; // dashboard label, e.g. "dev" | "stage"
  contractId: string; // VaquitaPool contract ID for this environment
  rpcUrl: string; // Soroban RPC endpoint for this environment
}

/** Parse VAQUITA_CONTRACTS="dev=C...,stage=C..." into ContractCfg[]. */
function parseContracts(spec: string | undefined): ContractCfg[] | null {
  if (!spec) return null;
  const out: ContractCfg[] = [];
  for (const part of spec.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1)
      throw new Error(`Bad VAQUITA_CONTRACTS entry "${trimmed}" (expected env=contractId).`);
    out.push({
      environment: trimmed.slice(0, eq).trim(),
      contractId: trimmed.slice(eq + 1).trim(),
      rpcUrl: RPC_URL,
    });
  }
  return out.length ? out : null;
}

// CI supplies VAQUITA_CONTRACTS; the fallback below is for local runs — edit the IDs.
const CONTRACTS: ContractCfg[] = parseContracts(process.env.VAQUITA_CONTRACTS) ?? [
  { environment: "dev", contractId: "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", rpcUrl: RPC_URL },
  // { environment: "stage", contractId: "C...", rpcUrl: RPC_URL },
];

const DUNE_API_KEY: string = process.env.DUNE_API_KEY ?? "";
const DUNE_NAMESPACE: string = process.env.DUNE_NAMESPACE ?? "vaquitaprotocol0178";
// Create:  POST /v1/uploads          (no /create suffix — that was the old /v1/table/create path)
// Insert:  POST /v1/uploads/:ns/:tbl/insert
const DUNE_CREATE_URL = "https://api.dune.com/api/v1/uploads";
const DUNE_INSERT_BASE = "https://api.dune.com/api/v1/uploads";
const DUNE_EXECUTE_BASE = "https://api.dune.com/api/v1/query"; // POST /:id/execute

// Saved dashboard query IDs to re-run after a successful insert so the panels
// show fresh data. Comma-separated, e.g. "7652901,7653540,...". Optional.
const DUNE_REFRESH_QUERY_IDS: string[] = (process.env.DUNE_REFRESH_QUERY_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

const REFRESH_DELAY_MS = positiveIntEnv("DUNE_REFRESH_DELAY_MS", 60_000);
const REFRESH_RETRY_DELAY_MS = positiveIntEnv("DUNE_REFRESH_RETRY_DELAY_MS", 60_000);

// ----------------------------- Types -----------------------------------------
type DuneColumnType = "varchar" | "integer" | "double" | "boolean" | "timestamp";
interface SchemaColumn {
  name: string;
  type: DuneColumnType;
  nullable?: boolean;
}

interface StellarEvent {
  id?: string;
  ledger?: number;
  ledgerClosedAt?: string;
  contractId?: string;
  type?: string;
  txHash?: string;
  topicJson?: unknown;
  topic?: unknown;
  valueJson?: unknown;
  value?: unknown;
}
interface GetEventsResult {
  events?: StellarEvent[];
  cursor?: string | null;
  latestLedger?: number;
}
interface HealthResult {
  oldestLedger: number;
  latestLedger: number;
}
interface JsonRpcResponse<T> {
  result?: T;
  error?: unknown;
}
/** Per-environment ingest cursor. */
interface EnvCursor {
  last_event_id: string;
  last_ledger: number;
}
/** State file: a map keyed by environment name. */
type IngestState = Record<string, EnvCursor>;

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
type EventRow = Record<(typeof COLUMNS)[number], string | number>;

const SCHEMA: SchemaColumn[] = [
  { name: "environment", type: "varchar", nullable: false }, // "dev" | "stage" | ... (dashboard filter)
  { name: "event_id", type: "varchar", nullable: false },
  { name: "ledger", type: "integer", nullable: false },
  { name: "ledger_closed_at", type: "timestamp", nullable: true },
  { name: "contract_id", type: "varchar", nullable: true }, // raw contract ID for this environment
  { name: "event_type", type: "varchar", nullable: true },
  { name: "tx_hash", type: "varchar", nullable: true },
  { name: "event_name", type: "varchar", nullable: true }, // "deposit" | "withdraw" | "fees_wth" | ...
  { name: "caller", type: "varchar", nullable: true }, // topic[1] address (deposit/withdraw)
  { name: "deposit_id", type: "varchar", nullable: true }, // data.deposit_id (join key)
  { name: "amount", type: "double", nullable: true }, // deposit=principal, withdraw=payout, fees_wth=swept
  { name: "lock_period", type: "integer", nullable: true }, // deposit selected period in seconds, if emitted/available
  { name: "reward", type: "double", nullable: true }, // withdraw only
  { name: "early_fee", type: "double", nullable: true }, // withdraw: penalty charged (also 0 if early w/ no interest)
  { name: "matured", type: "boolean", nullable: true }, // withdraw: true = held to maturity (completed cycle)
  { name: "topics_json", type: "varchar", nullable: true },
  { name: "value_json", type: "varchar", nullable: true },
];

// ------------------- ScVal (xdrFormat:"json") decoding ------------------------
// Recursively turn an ScVal-JSON node into a native JS value. Handles the field
// shapes VaquitaPool emits; tolerant of hi/lo as string or number.
// Decode a 64/128/256-bit ScVal scalar. Current Stellar RPC encodes these as a
// plain decimal string ("50000000"); older RPC used a {hi, lo} parts object.
// Handle both so amounts don't silently decode to 0.
function bigFromScalar(v: unknown): bigint {
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return (BigInt(String(o.hi ?? 0)) << 64n) + BigInt(String(o.lo ?? 0));
  }
  return BigInt(String(v));
}
function scToNative(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  const o = v as Record<string, any>;
  if ("symbol" in o) return o.symbol;
  if ("sym" in o) return o.sym;
  if ("string" in o) return o.string;
  if ("str" in o) return o.str;
  if ("address" in o)
    return typeof o.address === "string"
      ? o.address
      : (o.address?.accountId ?? o.address?.contractId ?? "");
  if ("bool" in o) return o.bool;
  if ("u32" in o) return Number(o.u32);
  if ("i32" in o) return Number(o.i32);
  if ("u64" in o) return bigFromScalar(o.u64);
  if ("i64" in o) return bigFromScalar(o.i64);
  if ("u128" in o) return bigFromScalar(o.u128);
  if ("i128" in o) return bigFromScalar(o.i128);
  if ("u256" in o) return bigFromScalar(o.u256);
  if ("i256" in o) return bigFromScalar(o.i256);
  if ("bytes" in o) return o.bytes;
  if ("vec" in o) return (o.vec ?? []).map(scToNative);
  if ("map" in o) {
    const out: Record<string, unknown> = {};
    for (const e of o.map ?? []) out[String(scToNative(e.key))] = scToNative(e.val);
    return out;
  }
  if ("void" in o) return null;
  return v;
}
function scaled(x: unknown): number | "" {
  return typeof x === "bigint" ? Number(x) / 10 ** DECIMALS : "";
}

// ----------------------------- Stellar RPC ------------------------------------
async function rpc<T>(
  rpcUrl: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as JsonRpcResponse<T>;
  if (body.error) throw new Error(`RPC error on ${method}: ${JSON.stringify(body.error)}`);
  return body.result as T;
}

async function ledgerBounds(rpcUrl: string): Promise<{ oldest: number; latest: number }> {
  const h = await rpc<HealthResult>(rpcUrl, "getHealth");
  return { oldest: Number(h.oldestLedger), latest: Number(h.latestLedger) };
}

/** Decode the ledger from a getEvents cursor / event id (a Stellar TOID, where
 *  the ledger sequence lives in the top 32 bits). Returns 0 for a missing token. */
function ledgerOf(toidWithIndex: string | null | undefined): number {
  if (!toidWithIndex) return 0;
  const toid = toidWithIndex.split("-")[0];
  try {
    return Number(BigInt(toid) >> 32n);
  } catch {
    return 0;
  }
}

const MAX_PAGES = 500; // safety bound on the pagination loop

async function fetchEvents(
  rpcUrl: string,
  contractId: string,
  startLedger: number
): Promise<StellarEvent[]> {
  const out: StellarEvent[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const pagination: Record<string, unknown> = { limit: PAGE_LIMIT };
    const params: Record<string, unknown> = {
      filters: [{ type: "contract", contractIds: [contractId] }],
      pagination,
      xdrFormat: "json",
    };
    if (cursor) pagination.cursor = cursor;
    else params.startLedger = startLedger;

    let result: GetEventsResult;
    try {
      result = await rpc<GetEventsResult>(rpcUrl, "getEvents", params);
    } catch (err) {
      // The live window advances ~every 5s, so a startLedger derived from an
      // earlier getHealth can fall just below the valid range. Retry once at
      // the window minimum the RPC reports in the error.
      const msg = err instanceof Error ? err.message : String(err);
      const m = !cursor && msg.match(/ledger range:\s*(\d+)\s*-\s*\d+/);
      if (!m) throw err;
      params.startLedger = Number(m[1]);
      result = await rpc<GetEventsResult>(rpcUrl, "getEvents", params);
    }

    out.push(...(result.events ?? []));
    cursor = result.cursor ?? null;
    const latest = Number(result.latestLedger ?? 0);

    // getEvents scans only a bounded window per call and returns a cursor even
    // when that window is empty — so DON'T stop on an empty page. Stop once the
    // cursor (or the data) has caught up to the chain tip.
    if (!cursor) break;
    if (latest && ledgerOf(cursor) >= latest) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return out;
}

function flatten(events: StellarEvent[], environment: string): EventRow[] {
  return events.map((e) => {
    const rawTopics = (e.topicJson ?? e.topic ?? []) as unknown[];
    const topics = rawTopics.map(scToNative);
    const data = (scToNative(e.valueJson ?? e.value ?? null) ?? {}) as Record<string, unknown>;
    const name = String(topics[0] ?? "");
    const hasCaller = name === "deposit" || name === "withdraw";
    return {
      environment,
      event_id: e.id ?? "",
      ledger: e.ledger ?? "",
      ledger_closed_at: e.ledgerClosedAt ?? "",
      contract_id: e.contractId ?? "",
      event_type: e.type ?? "",
      tx_hash: e.txHash ?? "",
      event_name: name,
      caller: hasCaller ? String(topics[1] ?? "") : "",
      deposit_id: data.deposit_id != null ? String(data.deposit_id) : "",
      amount: data.amount != null ? scaled(data.amount) : "",
      lock_period: data.lock_period != null ? String(data.lock_period) : data.period != null ? String(data.period) : "",
      reward: data.reward != null ? scaled(data.reward) : "",
      early_fee: data.early_fee != null ? scaled(data.early_fee) : "",
      matured: typeof data.matured === "boolean" ? String(data.matured) : "",
      topics_json: JSON.stringify(e.topicJson ?? e.topic ?? []),
      value_json: JSON.stringify(e.valueJson ?? e.value ?? null),
    };
  });
}

// ------------------------------- CSV ------------------------------------------
function csvField(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows: EventRow[]): string {
  const lines: string[] = [COLUMNS.join(",")];
  for (const row of rows) lines.push(COLUMNS.map((c) => csvField(row[c])).join(","));
  return lines.join("\n");
}

// ------------------------------- Dune API -------------------------------------
function duneHeaders(contentType: string): Record<string, string> {
  return { "X-Dune-Api-Key": DUNE_API_KEY, "Content-Type": contentType };
}
async function createTableIfNeeded(): Promise<void> {
  const res = await fetch(DUNE_CREATE_URL, {
    method: "POST",
    headers: duneHeaders("application/json"),
    body: JSON.stringify({
      namespace: DUNE_NAMESPACE,
      table_name: TABLE_NAME,
      description: "VaquitaPool events across environments (incremental ingest).",
      schema: SCHEMA,
      is_private: false,
    }),
  });
  if (res.status === 200 || res.status === 201)
    console.log(`Table ready: dune.${DUNE_NAMESPACE}.${TABLE_NAME}`);
  else if (res.status === 409) console.log("Table already exists, continuing.");
  else throw new Error(`Create failed HTTP ${res.status}: ${await res.text()}`);
}
async function insertRows(rows: EventRow[]): Promise<void> {
  if (rows.length === 0) {
    console.log("No new events to insert.");
    return;
  }
  const res = await fetch(`${DUNE_INSERT_BASE}/${DUNE_NAMESPACE}/${TABLE_NAME}/insert`, {
    method: "POST",
    headers: duneHeaders("text/csv"),
    body: toCsv(rows),
  });
  const text = await res.text();
  console.log("Insert response:", res.status, text);
  if (!res.ok) throw new Error(`Insert failed HTTP ${res.status}`);
  console.log(`Inserted ${rows.length} new events.`);
}

async function executeDashboardQuery(queryId: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${DUNE_EXECUTE_BASE}/${queryId}/execute`, {
      method: "POST",
      headers: duneHeaders("application/json"),
      body: JSON.stringify({ performance: "free" }),
    });
    const text = await res.text();
    console.log(`  query ${queryId}: ${res.status} ${text}`);

    if (res.status !== 402) return;

    console.warn(
      `  query ${queryId}: Dune free engine is at the parallel execution limit; ` +
        `retrying in ${Math.round(REFRESH_RETRY_DELAY_MS / 1000)}s (attempt ${attempt + 1})...`
    );
    await new Promise((r) => setTimeout(r, REFRESH_RETRY_DELAY_MS));
  }
}

/** Re-run the saved dashboard queries (one at a time, spaced apart) so the
 *  panels show the just-inserted data. Uses the free engine to minimise credits.
 *  Dune may return HTTP 402 when the free engine already has three parallel
 *  executions; retry that query until it is accepted, then continue.
 *  Best-effort: a failed refresh logs a warning but never fails the ingest. */
async function refreshDashboard(queryIds: string[]): Promise<void> {
  console.log(
    `Refreshing ${queryIds.length} dashboard quer${queryIds.length === 1 ? "y" : "ies"} ` +
      `(${Math.round(REFRESH_DELAY_MS / 1000)}s apart, ` +
      `${Math.round(REFRESH_RETRY_DELAY_MS / 1000)}s retry delay on 402)...`
  );
  for (let i = 0; i < queryIds.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, REFRESH_DELAY_MS));
    const id = queryIds[i];
    try {
      await executeDashboardQuery(id);
    } catch (err) {
      console.warn(`  query ${id} refresh failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ------------------------------- State ----------------------------------------
function loadState(): IngestState {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8")) as IngestState;
  return {};
}
function saveState(state: IngestState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ------------------------------- Main -----------------------------------------
async function main(): Promise<void> {
  if (CONTRACTS.length === 0)
    throw new Error('No contracts configured. Set VAQUITA_CONTRACTS="dev=C...,stage=C...".');
  for (const c of CONTRACTS) {
    if (!c.environment || !c.contractId || c.contractId.includes("XXXXXXXXXX"))
      throw new Error(
        `Configure a real contractId for environment "${c.environment || "?"}" ` +
          `(via VAQUITA_CONTRACTS or the in-script fallback).`
      );
  }
  if (!DUNE_API_KEY || !DUNE_NAMESPACE)
    throw new Error("Set DUNE_API_KEY and DUNE_NAMESPACE environment variables first.");

  await createTableIfNeeded();
  const state = loadState();
  const allNewRows: EventRow[] = [];

  for (const c of CONTRACTS) {
    const cursor: EnvCursor = state[c.environment] ?? { last_event_id: "", last_ledger: 0 };
    const { oldest, latest } = await ledgerBounds(c.rpcUrl);

    const start = Math.max(cursor.last_ledger, oldest);
    if (cursor.last_ledger && cursor.last_ledger < oldest) {
      console.warn(
        `[${c.environment}] WARNING: gap in history. Last ingested ledger ${cursor.last_ledger} ` +
          `aged out of RPC retention (oldest now ${oldest}). Schedule this job more frequently.`
      );
    }

    console.log(`[${c.environment}] Fetching events from ledger ${start} (latest ${latest})...`);
    const events = await fetchEvents(c.rpcUrl, c.contractId, start);

    const lastId = cursor.last_event_id;
    const newEvents = (lastId ? events.filter((e) => (e.id ?? "") > lastId) : events).sort(
      (a, b) => {
        const ai = a.id ?? "";
        const bi = b.id ?? "";
        return ai < bi ? -1 : ai > bi ? 1 : 0;
      }
    );

    console.log(`[${c.environment}] ${newEvents.length} new event(s).`);
    allNewRows.push(...flatten(newEvents, c.environment));

    if (newEvents.length > 0) {
      const newest = newEvents[newEvents.length - 1];
      state[c.environment] = {
        last_event_id: newest.id ?? cursor.last_event_id,
        last_ledger: Number(newest.ledger ?? cursor.last_ledger),
      };
    }
  }

  await insertRows(allNewRows);
  saveState(state);

  // Only refresh when something changed and query IDs are configured.
  if (allNewRows.length > 0 && DUNE_REFRESH_QUERY_IDS.length > 0) {
    await refreshDashboard(DUNE_REFRESH_QUERY_IDS);
  }

  console.log(
    `\nQuery it in Dune:\n    select * from dune.${DUNE_NAMESPACE}.${TABLE_NAME} order by ledger desc`
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

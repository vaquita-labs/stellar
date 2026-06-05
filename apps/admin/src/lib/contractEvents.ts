import { Networks, rpc, scValToNative } from '@stellar/stellar-sdk';

// Soroban-RPC scanner for the Vaquita pool contract. It returns every event the
// contract emitted in a date range — deposits/withdrawals plus admin calls
// (init, lp_add, upg_prop/upg_exec, executable_update, …) — which mirrors the
// "History" view of an explorer. The pool's deposit/withdraw payloads are
// decoded into structured fields (see contracts/vaquita-pool/src/events.rs):
//   topic ("deposit",  caller) -> { deposit_id, token, amount, shares }
//   topic ("withdraw", caller) -> { deposit_id, token, amount, reward }
//
// Two RPC quirks this handles:
//   1. getEvents only serves ledgers inside the retention window (a few days on
//      public RPCs). Older dates come back as a warning, clamped to that floor.
//   2. getEvents scans a BOUNDED ledger window per call (~10k ledgers) and
//      returns a cursor. An empty/short page does NOT mean "no more events" — we
//      MUST keep paging by cursor until it reaches the end ledger.

export interface ParsedPoolEvent {
  /** topic[0] symbol — e.g. deposit, withdraw, lp_add, upg_prop, init. */
  type: string;
  txHash: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  /** topic[1], best-effort. For deposit/withdraw this is the caller address. */
  caller: string;
  /** `deposit_id` (deposit/withdraw only) — maps to Deposit.depositIdHex. */
  depositId: string;
  /** Token contract address from the payload (deposit/withdraw only). */
  tokenAddress: string;
  /** Raw i128 amount in base units (deposit/withdraw only; '' otherwise). */
  amount: string;
  /** Deposit only. */
  shares: string;
  /** Withdraw only. */
  reward: string;
  /** Full decoded event payload as JSON (for non-deposit/withdraw events). */
  details: string;
}

export interface ScanRetention {
  oldestLedger: number;
  oldestLedgerCloseTime: string;
  latestLedger: number;
  latestLedgerCloseTime: string;
}

export interface ScanResult {
  events: ParsedPoolEvent[];
  /** Total events kept in the window. */
  scanned: number;
  retention: ScanRetention;
  ledgerRange: { startLedger: number; endLedger: number };
  /** True when the page cap was hit before the range was fully drained. */
  truncated: boolean;
  warnings: string[];
}

export interface ScanParams {
  rpcUrl: string;
  /** Pool contract addresses to filter on (RPC allows up to 5 per filter). */
  contractIds: string[];
  fromMs: number;
  toMs: number;
}

const PAGE_SIZE = 500;
const MAX_PAGES = 300; // backstop: each empty page advances ~10k ledgers
const END_LEDGER_BUFFER = 30; // a few ledgers of slack so the last events aren't cut

/** RPC close times come as unix seconds; event closes as RFC3339. Handle both. */
const toMs = (value: string | undefined): number => {
  if (!value) return Number.NaN;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber < 1e12 ? asNumber * 1000 : asNumber;
  }
  return Date.parse(value);
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** JSON.stringify that survives BigInt (scValToNative returns BigInt for i128). */
const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return String(value);
  }
};

// An event cursor/id is "<toid>-<index>" where toid = (ledger << 32) | …, so the
// ledger is the top 32 bits. Used to know when paging has reached the end.
const cursorLedger = (cursor: string | undefined): number => {
  if (!cursor) return Number.POSITIVE_INFINITY;
  try {
    return Number(BigInt(String(cursor).split('-')[0]) >> 32n);
  } catch {
    return 0;
  }
};

const topicToString = (v: unknown): string => (typeof v === 'string' ? v : safeStringify(v));

const parseEvent = (ev: rpc.Api.EventResponse): ParsedPoolEvent => {
  const topics = (ev.topic ?? []).map((t) => topicToString(scValToNative(t)));
  const type = topics[0] ?? '';
  const caller = topics[1] ?? '';
  const data = (scValToNative(ev.value) ?? {}) as Record<string, unknown>;
  const isDepositOrWithdraw = type === 'deposit' || type === 'withdraw';

  return {
    type,
    txHash: ev.txHash,
    ledger: ev.ledger,
    ledgerClosedAt: ev.ledgerClosedAt,
    contractId: ev.contractId ? ev.contractId.toString() : '',
    caller,
    depositId: isDepositOrWithdraw && data.deposit_id != null ? String(data.deposit_id) : '',
    tokenAddress: isDepositOrWithdraw && data.token != null ? String(data.token) : '',
    amount: isDepositOrWithdraw && data.amount != null ? String(data.amount) : '',
    shares: type === 'deposit' && data.shares != null ? String(data.shares) : '',
    reward: type === 'withdraw' && data.reward != null ? String(data.reward) : '',
    details: safeStringify(data),
  };
};

export async function scanPoolEvents(params: ScanParams): Promise<ScanResult> {
  const { rpcUrl, contractIds, fromMs, toMs: toMsParam } = params;
  const warnings: string[] = [];
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });

  const latest = await server.getLatestLedger();

  // Probe once (cheapest valid startLedger) to read the retention window, which
  // gives us two (ledger, time) anchors to interpolate dates -> ledgers.
  const probeStart = Math.max(1, latest.sequence - 1);
  const probe = await server.getEvents({
    filters: [{ type: 'contract', contractIds }],
    startLedger: probeStart,
    limit: 1,
  });

  const retention: ScanRetention = {
    oldestLedger: probe.oldestLedger,
    oldestLedgerCloseTime: probe.oldestLedgerCloseTime,
    latestLedger: probe.latestLedger,
    latestLedgerCloseTime: probe.latestLedgerCloseTime,
  };

  const oldestT = toMs(retention.oldestLedgerCloseTime);
  const latestT = toMs(retention.latestLedgerCloseTime);
  const spanMs = Math.max(1, latestT - oldestT);
  const ledgersPerMs = (retention.latestLedger - retention.oldestLedger) / spanMs;
  const ledgerForMs = (t: number): number => Math.round(retention.oldestLedger + ledgersPerMs * (t - oldestT));

  if (fromMs < oldestT) {
    warnings.push(
      `The start date is older than the RPC event-retention window (oldest available: ${new Date(
        oldestT
      ).toISOString()}). Results are limited to the retained range.`
    );
  }

  const startLedger = clamp(ledgerForMs(fromMs), retention.oldestLedger, retention.latestLedger);
  const endLedger = clamp(ledgerForMs(toMsParam) + END_LEDGER_BUFFER, startLedger, retention.latestLedger);

  // Filter by contract only — we classify events in parseEvent by reading
  // topic[0], which avoids depending on the exact symbol XDR encoding.
  const filters: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds }];

  const events: ParsedPoolEvent[] = [];
  let truncated = false;
  let cursor: string | undefined;
  let page = 0;

  for (; page < MAX_PAGES; page++) {
    const request: rpc.Api.GetEventsRequest = cursor
      ? { filters, cursor, limit: PAGE_SIZE }
      : { filters, startLedger, endLedger, limit: PAGE_SIZE };

    const res = await server.getEvents(request);

    for (const ev of res.events) {
      if (ev.ledger < startLedger || ev.ledger > endLedger) continue;
      const eventMs = toMs(ev.ledgerClosedAt);
      if (Number.isFinite(eventMs) && (eventMs < fromMs || eventMs > toMsParam)) continue;
      events.push(parseEvent(ev));
    }

    // getEvents scans a bounded ledger window per call: keep paging by cursor
    // (empty pages are normal) until the cursor reaches the end of our range.
    if (!res.cursor || cursorLedger(res.cursor) >= endLedger) break;
    cursor = res.cursor;
  }
  if (page >= MAX_PAGES) truncated = true;

  return { events, scanned: events.length, retention, ledgerRange: { startLedger, endLedger }, truncated, warnings };
}

/** Default RPC endpoint by network passphrase when SOROBAN_RPC_URL isn't set. */
export const defaultRpcUrlFor = (networkPassphrase: string | null | undefined): string =>
  networkPassphrase === Networks.PUBLIC
    ? 'https://soroban-rpc.mainnet.stellar.org:443'
    : 'https://soroban-testnet.stellar.org';

/** Format a raw base-unit i128 string into a human decimal using token decimals. */
export const formatUnits = (raw: string, decimals: number | null | undefined): string => {
  const d = decimals ?? 0;
  let negative = false;
  let digits = raw.trim();
  if (digits.startsWith('-')) {
    negative = true;
    digits = digits.slice(1);
  }
  if (!/^\d+$/.test(digits)) return raw;
  if (d <= 0) return `${negative ? '-' : ''}${digits}`;

  const padded = digits.padStart(d + 1, '0');
  const whole = padded.slice(0, padded.length - d);
  const fraction = padded.slice(padded.length - d).replace(/0+$/, '');
  const value = fraction ? `${whole}.${fraction}` : whole;
  return `${negative ? '-' : ''}${value}`;
};

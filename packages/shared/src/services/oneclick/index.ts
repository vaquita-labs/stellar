import { assetsForDirection, type BridgeDirection } from './assets';

export * from './assets';

/**
 * NEAR Intents 1Click — the cross-chain USDC bridge.
 *
 * Settlement is by DEPOSIT ADDRESS, which is the whole reason this replaced a
 * hand-rolled CCTP stack: we ask for a quote, 1Click returns an address, and
 * the user funds it from whatever wallet or exchange they already use. Nothing
 * here signs anything, holds a key, or talks to an EVM chain.
 *
 * Written as a small `fetch` client rather than the published SDK on purpose:
 * that SDK is codegen configured through a mutable `OpenAPI` global, which is
 * the wrong shape for a server handling concurrent requests. Base URL and token
 * are PARAMETERS — never read from `process.env` in here — so this is testable
 * without stubbing the environment.
 */

/** 1Click's swap lifecycle, stored verbatim in `bridge_transfers.status`. */
export type OneClickStatus =
  | 'KNOWN_DEPOSIT_TX'
  | 'PENDING_DEPOSIT'
  | 'INCOMPLETE_DEPOSIT'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'REFUNDED'
  | 'FAILED';

/** Statuses that will never change again, so there is nothing left to poll. */
const TERMINAL: readonly OneClickStatus[] = ['SUCCESS', 'REFUNDED', 'FAILED'];

export const isTerminalStatus = (status: string): boolean =>
  (TERMINAL as readonly string[]).includes(status);

export type OneClickQuote = {
  depositAddress?: string;
  /** Present only when the origin is Stellar (depositMode MEMO). */
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd?: string;
  minAmountIn?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd?: string;
  minAmountOut?: string;
  deadline?: string;
  timeWhenInactive?: string;
  /** Seconds, 1Click's own estimate. */
  timeEstimate?: number;
  refundFee?: number;
  withdrawFee?: number;
};

export type OneClickQuoteResponse = {
  /** Echoes back on the status endpoint; the id to quote in a dispute. */
  correlationId?: string;
  timestamp?: string;
  /** 1Click's signature over the quote. Persisted — see BridgeTransfer.quote. */
  signature?: string;
  quoteRequest?: Record<string, unknown>;
  quote: OneClickQuote;
};

export type OneClickStatusResponse = {
  status: OneClickStatus;
  updatedAt?: string;
  quoteResponse?: OneClickQuoteResponse;
  swapDetails?: {
    intentHashes?: string[];
    originChainTxHashes?: { hash: string; explorerUrl?: string }[];
    destinationChainTxHashes?: { hash: string; explorerUrl?: string }[];
    refundedAmount?: string;
    refundedAmountFormatted?: string;
    amountIn?: string;
    amountInFormatted?: string;
    amountOut?: string;
    amountOutFormatted?: string;
  };
};

export type OneClickConfig = {
  /** e.g. https://1click.chaindefuser.com */
  baseUrl: string;
  /** Optional: raises rate limits and attributes referrals. Quotes work without it. */
  jwt?: string;
  /** ms */
  timeoutMs?: number;
};

export type OneClickResult<T> = { ok: true; data: T } | { ok: false; reason: string };

type RequestQuoteParams = {
  direction: BridgeDirection;
  /** Base units of the ORIGIN asset, as an integer string. */
  amountRaw: string;
  /** Where the swapped funds land: a G… for Stellar, a 0x… for Base. */
  recipient: string;
  /** Where a failed swap goes back to, on the origin chain. */
  refundTo: string;
  /** true = preview only, no deposit address is issued. */
  dry: boolean;
  /** Quote validity. Defaults to one hour out. */
  deadline?: Date;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const QUOTE_VALIDITY_MS = 60 * 60 * 1000;

async function request<T>(
  config: OneClickConfig,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<OneClickResult<T>> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(config.jwt ? { Authorization: `Bearer ${config.jwt}` } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      // 1Click's 4xx bodies are readable and actionable — a missing Stellar
      // trustline arrives this way — so the message is surfaced, not swallowed.
      return { ok: false, reason: extractError(text) ?? `1Click ${res.status}` };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, reason: 'malformed response from 1Click' };
    }
  } catch (error) {
    const aborted = (error as Error)?.name === 'AbortError';
    return { ok: false, reason: aborted ? '1Click request timed out' : '1Click request failed' };
  } finally {
    clearTimeout(timer);
  }
}

/** Pulls the human-readable part out of a 1Click error body, if there is one. */
function extractError(text: string): string | null {
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown };
    const raw = body.message ?? body.error;
    if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 300);
    if (Array.isArray(raw) && raw.length) return String(raw[0]).slice(0, 300);
  } catch {
    /* not JSON — fall through */
  }
  return text.trim() ? text.trim().slice(0, 300) : null;
}

export async function requestQuote(
  config: OneClickConfig,
  params: RequestQuoteParams,
): Promise<OneClickResult<OneClickQuoteResponse>> {
  const { origin, destination } = assetsForDirection(params.direction);
  const deadline = params.deadline ?? new Date(Date.now() + QUOTE_VALIDITY_MS);

  const body = {
    dry: params.dry,
    // Stellar identifies the depositor by memo; every other chain gets its own
    // address. Getting this wrong means the deposit arrives unattributed.
    depositMode: origin.chain === 'stellar' ? 'MEMO' : 'SIMPLE',
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100, // bps
    originAsset: origin.assetId,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: destination.assetId,
    amount: params.amountRaw,
    refundTo: params.refundTo,
    refundType: 'ORIGIN_CHAIN',
    recipient: params.recipient,
    recipientType: 'DESTINATION_CHAIN',
    // Required, and must be ISO-8601 — 1Click 400s on a missing one even
    // though its own SDK types mark it optional.
    deadline: deadline.toISOString(),
    // Our app fee: none. Note this does NOT zero what the user pays — measured
    // against the live API on 2026-09-07, an unauthenticated caller has a 10 bps
    // referral fee injected to 1Click's own recipient whether this is sent as
    // `[]` or omitted entirely (10 USDC in -> 9.9698 out, both ways). The only
    // way to drop that 0.1% is to register the app and send NEAR_1CLICK_JWT.
    // Sending it explicitly is still right: it is where OUR fee would go.
    appFees: [],
  };

  return request<OneClickQuoteResponse>(config, '/v0/quote', { method: 'POST', body });
}

export async function getStatus(
  config: OneClickConfig,
  depositAddress: string,
  depositMemo?: string | null,
): Promise<OneClickResult<OneClickStatusResponse>> {
  const query = new URLSearchParams({ depositAddress });
  if (depositMemo) query.set('depositMemo', depositMemo);
  return request<OneClickStatusResponse>(config, `/v0/status?${query.toString()}`, { method: 'GET' });
}

/**
 * Tells 1Click which transaction funded a deposit address.
 *
 * Optional for the inbound leg — 1Click watches the address anyway — but it
 * shortens the wait, and on the Stellar leg it is what lets a memo'd payment be
 * matched immediately instead of by polling.
 */
export async function submitDepositTx(
  config: OneClickConfig,
  params: { txHash: string; depositAddress: string; memo?: string | null },
): Promise<OneClickResult<OneClickStatusResponse>> {
  return request<OneClickStatusResponse>(config, '/v0/deposit/submit', {
    method: 'POST',
    body: {
      txHash: params.txHash,
      depositAddress: params.depositAddress,
      ...(params.memo ? { memo: params.memo } : {}),
    },
  });
}

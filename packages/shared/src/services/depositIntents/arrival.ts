import { prisma } from '@vaquita/db';
import type { DepositIntent } from '@vaquita/db';
import { getHorizonServer } from '../balances';
import { getDepositPlatforms, getProjectConfig } from '../project-config';
import { notifyDepositReceived } from './depositReceivedNotice';

/**
 * Deciding on the server that the money behind a waiting card arrived.
 *
 * The web used to be the only judge: it compared the wallet's USDC against a
 * baseline taken when the card mounted, so a deposit that landed with the app
 * closed was already inside the baseline after a reload and the card spun
 * until it expired. Here the chain answers instead — a USDC payment into the
 * intent's wallet since the intent was opened.
 */

/** Same floor the web uses for "money worth mentioning" (`MIN_IDLE_USDC`). */
export const MIN_ARRIVAL_USDC = 0.005;

/** Horizon's `created_at` and our `created_at` come from different clocks. */
const CLOCK_SKEW_MS = 60_000;

/** A slow Horizon must not hold up `GET /deposit-intents/open`. */
const HORIZON_TIMEOUT_MS = 4_000;

const PAYMENT_TYPES = new Set(['payment', 'path_payment_strict_receive', 'path_payment_strict_send']);

/** The fields of a Horizon payment record this module reads. */
export interface HorizonPaymentRecord {
  id: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful?: boolean;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
}

export interface ArrivalPayment {
  txHash: string;
  operationId: string;
  amount: number;
  from: string;
}

/**
 * The earliest USDC payment into `walletAddress` since `since`, or null.
 * Pure: the rules are tested without Horizon.
 *
 * Only the configured USDC issuers count (testnet carries several assets called
 * USDC), the user paying themselves does not, nor does dust below the floor.
 */
export const pickArrivalPayment = (
  records: HorizonPaymentRecord[],
  { walletAddress, usdcIssuers, since }: { walletAddress: string; usdcIssuers: string[]; since: Date },
): ArrivalPayment | null => {
  const floor = since.getTime() - CLOCK_SKEW_MS;
  const matches = records.filter(
    (r) =>
      PAYMENT_TYPES.has(r.type) &&
      r.transaction_successful !== false &&
      r.to === walletAddress &&
      r.from !== walletAddress &&
      r.asset_type !== 'native' &&
      r.asset_code?.toUpperCase() === 'USDC' &&
      !!r.asset_issuer &&
      usdcIssuers.includes(r.asset_issuer) &&
      Date.parse(r.created_at) >= floor &&
      Number(r.amount) >= MIN_ARRIVAL_USDC,
  );
  if (matches.length === 0) return null;

  const earliest = matches.reduce((a, b) => (Date.parse(b.created_at) < Date.parse(a.created_at) ? b : a));
  return {
    txHash: earliest.transaction_hash,
    operationId: earliest.id,
    amount: Number(earliest.amount),
    from: earliest.from ?? '',
  };
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Horizon timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/** Network and USDC issuers from the project config, read once per call site. */
export interface ArrivalContext {
  networkName: string;
  usdcIssuers: string[];
}

export const loadArrivalContext = async (): Promise<ArrivalContext | null> => {
  const config = await getProjectConfig();
  if (!config) return null;
  const usdcIssuers = config.tokens
    .filter((t) => t.symbol.toUpperCase() === 'USDC' && !!t.issuer)
    .map((t) => t.issuer as string);
  if (usdcIssuers.length === 0) return null;
  return { networkName: config.networkName, usdcIssuers };
};

/**
 * The payment that fulfils this intent, or null. Never throws: an unreachable
 * Horizon reads as "not yet", which leaves the card exactly as it was.
 *
 * A payment already recorded as a peer-to-peer transfer is skipped — its
 * receiver got `transferReceived` for it, and it is not the platform deposit
 * the card is waiting for.
 */
export const findIntentArrival = async (
  intent: Pick<DepositIntent, 'id' | 'walletAddress' | 'createdAt'>,
  context?: ArrivalContext | null,
): Promise<ArrivalPayment | null> => {
  try {
    const ctx = context === undefined ? await loadArrivalContext() : context;
    if (!ctx) return null;
    const server = getHorizonServer(ctx.networkName);
    if (!server) return null;

    const page = await withTimeout(
      server.payments().forAccount(intent.walletAddress).order('desc').limit(50).call(),
      HORIZON_TIMEOUT_MS,
    );
    const records = page.records as unknown as HorizonPaymentRecord[];

    const known = await prisma.walletTransfer.findMany({
      where: { transactionHash: { in: records.map((r) => r.transaction_hash) } },
      select: { transactionHash: true },
    });
    const knownHashes = new Set(known.map((k) => k.transactionHash));

    return pickArrivalPayment(
      records.filter((r) => !knownHashes.has(r.transaction_hash)),
      { walletAddress: intent.walletAddress, usdcIssuers: ctx.usdcIssuers, since: intent.createdAt },
    );
  } catch (error) {
    console.error('Error checking a deposit intent on chain', { depositIntentId: intent.id }, error);
    return null;
  }
};

/**
 * Closes the intent as `arrived` and, if this call is the one that closed it,
 * notifies the user. The `status: 'open'` guard makes the close atomic, so the
 * open-intent read, the client report, several tabs and several API instances
 * can all race here and exactly one notice goes out.
 *
 * Returns true when this call closed the intent.
 */
export const settleArrivedIntent = async (
  intent: Pick<DepositIntent, 'id' | 'profileId' | 'walletAddress' | 'platformId'>,
  payment: ArrivalPayment,
): Promise<boolean> => {
  const { count } = await prisma.depositIntent.updateMany({
    where: { id: intent.id, status: 'open' },
    data: { status: 'arrived', arrivedAt: new Date() },
  });
  if (count === 0) return false;

  const platforms = await getDepositPlatforms().catch(() => []);
  const platformName = platforms.find((p) => p.id === intent.platformId)?.name ?? intent.platformId;

  await notifyDepositReceived({
    intentId: intent.id,
    profileId: intent.profileId,
    walletAddress: intent.walletAddress,
    amount: payment.amount,
    platformName,
  });
  return true;
};

/**
 * Checks every open intent against the chain — the cold path, for the user who
 * closed the app while waiting. Bounded by `limit` per run, oldest first, and a
 * few Horizon calls at a time.
 */
export const sweepOpenDepositIntents = async ({
  limit = 200,
  concurrency = 5,
}: { limit?: number; concurrency?: number } = {}): Promise<{ checked: number; arrived: number }> => {
  await prisma.depositIntent.updateMany({
    where: { status: 'open', expiresAt: { lte: new Date() } },
    data: { status: 'expired' },
  });
  const open = await prisma.depositIntent.findMany({
    where: { status: 'open' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  if (open.length === 0) return { checked: 0, arrived: 0 };

  const context = await loadArrivalContext();
  if (!context) return { checked: 0, arrived: 0 };

  let arrived = 0;
  let next = 0;
  const worker = async () => {
    while (next < open.length) {
      const intent = open[next++]!;
      const payment = await findIntentArrival(intent, context);
      if (payment && (await settleArrivedIntent(intent, payment))) arrived += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, open.length) }, worker));

  return { checked: open.length, arrived };
};

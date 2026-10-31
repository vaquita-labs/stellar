import { prisma } from '@vaquita/db';

/**
 * What the flexible (DeFi) savings earned, per day, month or year.
 *
 * Nothing on chain hands out "interest earned": the vault only exposes a
 * balance. What the server does have is `wallet_balance_history`, an
 * append-only trail of that balance taken whenever the app refreshed it, and
 * `vault_flows`, every deposit into and withdrawal out of the vault. Between
 * two samples the balance moved by (earnings + deposits - withdrawals), so the
 * earnings of that stretch are the balance delta with the flows taken back
 * out. That gain is spread evenly over the stretch, and each bucket collects
 * the part of every stretch that falls inside it.
 *
 * Samples come when the user opens the app, not on a schedule, so a bucket
 * with no sample inside is `estimated`: its figure is the share of a stretch
 * that spans it. After the last sample the stretch's pace is carried forward
 * to `now`, estimated too. Before the first sample there is nothing to say,
 * and `firstSampleAt` tells the client how far back the figures go.
 *
 * Locked positions (the 1, 3 and 6 month terms) are not part of this on
 * purpose: their interest is a contract figure known at deposit time, not
 * something measured.
 */

export type EarningsPeriod = 'daily' | 'monthly' | 'yearly';

export const EARNINGS_PERIODS: EarningsPeriod[] = ['daily', 'monthly', 'yearly'];
/** Bars per period when the client does not say. */
export const DEFAULT_BUCKETS: Record<EarningsPeriod, number> = { daily: 7, monthly: 6, yearly: 3 };
export const MAX_BUCKETS = 60;

export interface BalanceSample {
  /** Epoch ms. */
  observedAt: number;
  /** The flexible balance at that instant, in USDC. */
  balance: number;
}

export interface BalanceFlow {
  /** Epoch ms. */
  confirmedAt: number;
  direction: 'deposit' | 'withdraw';
  amount: number;
}

export interface Bucket {
  /** Epoch ms, inclusive. */
  start: number;
  /** Epoch ms, exclusive. */
  end: number;
}

export interface EarningsBucket {
  start: string;
  end: string;
  earned: number;
  /** No sample fell inside the bucket: its figure is interpolated or carried forward. */
  estimated: boolean;
}

export interface PassiveEarnings {
  currency: 'USDC';
  period: EarningsPeriod;
  timeZone: string;
  buckets: EarningsBucket[];
  /** Everything the flexible savings earned since the first sample. */
  totalEarned: number;
  firstSampleAt: string | null;
  asOf: string;
}

// --- Calendar buckets in the user's time zone ----------------------------------

const PARTS = new Map<string, Intl.DateTimeFormat>();

const formatter = (timeZone: string): Intl.DateTimeFormat => {
  let f = PARTS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    PARTS.set(timeZone, f);
  }
  return f;
};

/** Whether the runtime knows the zone; an unknown one would throw on every call. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock parts of an instant in a zone, and that zone's offset at the instant. */
function zoned(ts: number, timeZone: string): { y: number; m: number; d: number; offsetMs: number } {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(ts))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const localAsUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  // The offset is a whole number of minutes everywhere; the rounding drops the sub-second part of `ts`.
  const offsetMs = Math.round((localAsUtc - ts) / 60_000) * 60_000;
  return { y: parts.year!, m: parts.month! - 1, d: parts.day!, offsetMs };
}

/** The instant a local calendar date starts, in the zone. */
function zonedStart(y: number, m: number, d: number, timeZone: string): number {
  // Resolve the offset at (roughly) that instant, then once more at the
  // result, so a DST change on that very date lands on the right side.
  const guess = Date.UTC(y, m, d) - zoned(Date.UTC(y, m, d), timeZone).offsetMs;
  return Date.UTC(y, m, d) - zoned(guess, timeZone).offsetMs;
}

/** The last `count` calendar buckets of `period`, oldest first, the last one holding `now`. */
export function bucketsEndingNow(period: EarningsPeriod, count: number, now: number, timeZone: string): Bucket[] {
  const today = zoned(now, timeZone);
  const buckets: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    if (period === 'daily') {
      buckets.push({
        start: zonedStart(today.y, today.m, today.d - i, timeZone),
        end: zonedStart(today.y, today.m, today.d - i + 1, timeZone),
      });
    } else if (period === 'monthly') {
      buckets.push({
        start: zonedStart(today.y, today.m - i, 1, timeZone),
        end: zonedStart(today.y, today.m - i + 1, 1, timeZone),
      });
    } else {
      buckets.push({ start: zonedStart(today.y - i, 0, 1, timeZone), end: zonedStart(today.y - i + 1, 0, 1, timeZone) });
    }
  }
  return buckets;
}

// --- The arithmetic ---------------------------------------------------------------

interface Stretch {
  from: number;
  to: number;
  /** Earnings per ms over the stretch. */
  rate: number;
}

/**
 * The stretches between consecutive samples, each with the pace the balance
 * grew at once the flows in it are taken out, plus one carried forward from
 * the last sample to `now` at the previous stretch's pace. A negative gain (a
 * movement nobody recorded) counts as zero rather than as money lost.
 */
export function earningStretches(samples: BalanceSample[], flows: BalanceFlow[], now: number): Stretch[] {
  const sorted = [...samples].sort((a, b) => a.observedAt - b.observedAt);
  const stretches: Stretch[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const span = curr.observedAt - prev.observedAt;
    if (span <= 0) continue;
    let net = 0;
    for (const flow of flows) {
      if (flow.confirmedAt > prev.observedAt && flow.confirmedAt <= curr.observedAt)
        net += flow.direction === 'deposit' ? flow.amount : -flow.amount;
    }
    const gain = Math.max(0, curr.balance - prev.balance - net);
    stretches.push({ from: prev.observedAt, to: curr.observedAt, rate: gain / span });
  }
  const last = sorted[sorted.length - 1];
  if (last && now > last.observedAt) {
    const pace = stretches.length ? stretches[stretches.length - 1]!.rate : 0;
    stretches.push({ from: last.observedAt, to: now, rate: pace });
  }
  return stretches;
}

/** What the stretches add up to inside each bucket, and whether a sample backs the bucket. */
export function bucketEarnings(
  buckets: Bucket[],
  stretches: Stretch[],
  samples: BalanceSample[],
  now: number,
): EarningsBucket[] {
  return buckets.map((bucket) => {
    const end = Math.min(bucket.end, now);
    let earned = 0;
    for (const s of stretches) {
      const from = Math.max(s.from, bucket.start);
      const to = Math.min(s.to, end);
      if (to > from) earned += s.rate * (to - from);
    }
    const sampled = samples.some((s) => s.observedAt >= bucket.start && s.observedAt < end);
    return {
      start: new Date(bucket.start).toISOString(),
      end: new Date(bucket.end).toISOString(),
      earned: round(earned),
      estimated: !sampled,
    };
  });
}

const round = (value: number) => Math.round(value * 1e7) / 1e7;

export function computePassiveEarnings(input: {
  samples: BalanceSample[];
  flows: BalanceFlow[];
  period: EarningsPeriod;
  count: number;
  timeZone: string;
  now: number;
}): PassiveEarnings {
  const { samples, flows, period, count, timeZone, now } = input;
  const stretches = earningStretches(samples, flows, now);
  const buckets = bucketEarnings(bucketsEndingNow(period, count, now, timeZone), stretches, samples, now);
  const totalEarned = round(stretches.reduce((sum, s) => sum + s.rate * (s.to - s.from), 0));
  const first = samples.length ? Math.min(...samples.map((s) => s.observedAt)) : null;
  return {
    currency: 'USDC',
    period,
    timeZone,
    buckets,
    totalEarned,
    firstSampleAt: first === null ? null : new Date(first).toISOString(),
    asOf: new Date(now).toISOString(),
  };
}

// --- Reading the trail ----------------------------------------------------------

/** The wallet's flexible earnings from the stored samples and flows. */
export async function getPassiveEarnings(input: {
  walletAddress: string;
  tokenId: number;
  period: EarningsPeriod;
  count: number;
  timeZone: string;
  now?: number;
}): Promise<PassiveEarnings> {
  const now = input.now ?? Date.now();
  const rows = await prisma.walletBalanceHistory.findMany({
    where: { walletAddress: input.walletAddress, tokenId: input.tokenId, observedAt: { lte: new Date(now) } },
    orderBy: { observedAt: 'asc' },
    select: { observedAt: true, blendUsdc: true, vaultUsdc: true },
  });
  // Both products are flexible savings; a wallet holds one of them at a time
  // and the migration between them is recorded as two flows that cancel out.
  const samples: BalanceSample[] = rows.map((r) => ({
    observedAt: r.observedAt.getTime(),
    balance: Number(r.blendUsdc) + Number(r.vaultUsdc),
  }));
  const flowRows = samples.length
    ? await prisma.vaultFlow.findMany({
        where: {
          walletAddress: input.walletAddress,
          tokenId: input.tokenId,
          deletedAt: null,
          confirmedAt: { gt: new Date(samples[0]!.observedAt), lte: new Date(now) },
        },
        select: { confirmedAt: true, direction: true, amount: true },
      })
    : [];
  const flows: BalanceFlow[] = flowRows.map((f) => ({
    confirmedAt: f.confirmedAt.getTime(),
    direction: f.direction === 'withdraw' ? 'withdraw' : 'deposit',
    amount: Number(f.amount),
  }));
  return computePassiveEarnings({ samples, flows, period: input.period, count: input.count, timeZone: input.timeZone, now });
}

import { prisma } from '@vaquita/db';

// ---------------------------------------------------------------------------
// Cycle duration config
// ---------------------------------------------------------------------------

/**
 * Returns the fixed cycle duration in milliseconds from the singleton `config`
 * row (`cycle_duration_ms`), or null in production (calendar month cycles).
 * Sourced from the DB so it can be changed at runtime from the admin.
 */
export async function getCycleDurationMs(): Promise<number | null> {
  const config = await prisma.config.findFirst({ select: { cycleDurationMs: true } });
  const n = config?.cycleDurationMs;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Cycle boundary helpers
// ---------------------------------------------------------------------------

export type LeaderboardCycleStatus = 'current' | 'last_closed' | 'historical';

export interface ResolvedLeaderboardCycle {
  cycleId: number;
  cycleStatus: LeaderboardCycleStatus;
}

const calendarCycleId = (date: Date): number => date.getUTCFullYear() * 100 + (date.getUTCMonth() + 1);

/**
 * Converts a cycle ID to UTC start/end millisecond timestamps.
 *
 * - 6-digit YYYYMM → production monthly cycle
 * - Unix epoch seconds → test fixed-duration cycle (requires cycle_duration_ms)
 */
export async function cycleIdToBoundaries(cycleId: number): Promise<{ cycleStart: number; cycleEnd: number }> {
  const year = Math.floor(cycleId / 100);
  const month = cycleId % 100; // 1-based
  const isCalendarCycleId = cycleId >= 100_000 && cycleId <= 999_999 && year >= 1970 && month >= 1 && month <= 12;

  if (isCalendarCycleId) {
    // YYYYMM format
    return {
      cycleStart: Date.UTC(year, month - 1, 1),
      cycleEnd:   Date.UTC(year, month,     1),
    };
  }
  // Epoch-seconds: end = start + cycle_duration_ms
  const durationMs = (await getCycleDurationMs()) ?? 30 * 24 * 60 * 60 * 1000;
  const cycleStart = cycleId * 1000;
  return { cycleStart, cycleEnd: cycleStart + durationMs };
}

/**
 * Returns the cycle ID for the currently open configured cycle.
 *
 * - Without cycle_duration_ms: current UTC calendar month as YYYYMM.
 * - With cycle_duration_ms: the start (epoch-seconds) of the active fixed cycle.
 */
export async function getCurrentCycleId(): Promise<number> {
  const durationMs = await getCycleDurationMs();
  if (!durationMs) return calendarCycleId(new Date());

  const durationS = durationMs / 1000;
  const nowS = Math.floor(Date.now() / 1000);
  return Math.floor(nowS / durationS) * durationS;
}

/**
 * Returns the cycle ID of the last fully closed cycle.
 *
 * - Without cycle_duration_ms: previous calendar month as YYYYMM.
 * - With cycle_duration_ms: the start (epoch-seconds) of the previous
 *   completed fixed-duration cycle.
 */
export async function getLastClosedCycleId(): Promise<number> {
  const durationMs = await getCycleDurationMs();
  if (!durationMs) {
    const d = new Date();
    const year  = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
    const month = d.getUTCMonth() === 0 ? 12 : d.getUTCMonth(); // 1-based previous month
    return year * 100 + month;
  }
  const durationS = durationMs / 1000;
  const nowS = Math.floor(Date.now() / 1000);
  const currentCycleStart = Math.floor(nowS / durationS) * durationS;
  return currentCycleStart - durationS; // previous cycle start in seconds
}

/**
 * Parses the public leaderboard cycle query modes:
 * omitted/current, last_closed, or an explicit positive cycle ID.
 */
export async function parseLeaderboardCycleQuery(value: unknown): Promise<ResolvedLeaderboardCycle> {
  const raw = Array.isArray(value) ? value[0] : value;

  if (raw == null || raw === '' || raw === 'current') {
    return { cycleId: await getCurrentCycleId(), cycleStatus: 'current' };
  }

  if (raw === 'last_closed') {
    return { cycleId: await getLastClosedCycleId(), cycleStatus: 'last_closed' };
  }

  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new Error('cycle must be current, last_closed, or a positive integer cycle id');
  }

  const cycleId = Number(raw);
  if (!Number.isInteger(cycleId) || cycleId <= 0) {
    throw new Error('cycle must be current, last_closed, or a positive integer cycle id');
  }

  return { cycleId, cycleStatus: 'historical' };
}

// ---------------------------------------------------------------------------
// Leaderboard query
// ---------------------------------------------------------------------------

export interface LeaderboardRow {
  walletAddress: string;
  score: number;          // USDC×seconds (closed + open at query time)
  activeAmount: number;   // total USDC in currently active deposits
  cycleId: number;
  cycleStart: number;     // unix ms
  cycleEnd: number;       // unix ms
}

/**
 * Computes USDC×seconds leaderboard for a given cycle.
 * Pass cycleId=0 to compute a live leaderboard ending at now.
 * Matches the formula in §9.3 of the whitepaper.
 */
export async function getLeaderboard(
  cycleId: number,
  // Single-network now: network_id was dropped. Param kept optional + ignored for
  // back-compat with existing callers.
  _networkId?: number,
): Promise<LeaderboardRow[]> {
  const { cycleStart, cycleEnd: rawEnd } = await cycleIdToBoundaries(cycleId);
  const now = Date.now();
  const cycleEnd = cycleStart <= now && rawEnd > now ? now : rawEnd;

  // Fetch all confirmed deposits that overlap [cycleStart, cycleEnd)
  const deposits = await prisma.deposit.findMany({
    where: {
      status: 'confirmed',
      updatedAt: { lt: new Date(cycleEnd) },
      deletedAt: null,
    },
    select: {
      walletAddress: true,
      amount: true,
      updatedAt: true,
      withdrawals: { select: { updatedAt: true, status: true, reward: true } },
    },
  });

  // Score accumulator per wallet
  const scoreMap = new Map<string, { score: number; activeAmount: number }>();

  for (const deposit of deposits) {
    const wallet = deposit.walletAddress;
    const amount = deposit.amount.toNumber();
    const depositedAt = deposit.updatedAt.getTime();

    // Find an on-time confirmed withdrawal (reward > 0)
    const withdrawals = deposit.withdrawals;

    const onTimeWithdrawal = withdrawals.find(
      (w) => w.status === 'confirmed' && w.reward != null && w.reward.toNumber() > 0,
    );

    let effectiveEnd: number;
    let isActive: boolean;

    if (onTimeWithdrawal?.updatedAt) {
      const withdrawnAt = onTimeWithdrawal.updatedAt.getTime();
      // Only count if withdrawal was after cycle start
      if (withdrawnAt <= cycleStart) continue;
      effectiveEnd = Math.min(withdrawnAt, cycleEnd);
      isActive = false;
    } else {
      // Still active — contribute up to cycleEnd (or now for live)
      effectiveEnd = cycleEnd;
      isActive = withdrawals.every((w) => w.status !== 'confirmed');
    }

    const effectiveStart = Math.max(depositedAt, cycleStart);
    if (effectiveStart >= effectiveEnd) continue;

    const durationSeconds = (effectiveEnd - effectiveStart) / 1000;
    const contribution = amount * durationSeconds;

    const existing = scoreMap.get(wallet) ?? { score: 0, activeAmount: 0 };
    scoreMap.set(wallet, {
      score: existing.score + contribution,
      activeAmount: existing.activeAmount + (isActive ? amount : 0),
    });
  }

  const rows: LeaderboardRow[] = Array.from(scoreMap.entries()).map(([walletAddress, v]) => ({
    walletAddress,
    score: v.score,
    activeAmount: v.activeAmount,
    cycleId,
    cycleStart,
    cycleEnd,
  }));

  // Sort by score desc; tiebreaker applied separately
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

// ---------------------------------------------------------------------------
// Tiebreaker data
// ---------------------------------------------------------------------------

interface TiebreakerData {
  totalCompletedCycles: number;
  lastDepositTimestamp: number; // unix ms — earlier = higher rank
}

async function getTiebreakerData(
  walletAddress: string,
): Promise<TiebreakerData> {
  const data = await prisma.deposit.findMany({
    where: { walletAddress, status: 'confirmed', deletedAt: null },
    select: { updatedAt: true, withdrawals: { select: { status: true, reward: true } } },
    orderBy: { updatedAt: 'asc' },
  });

  let totalCompletedCycles = 0;
  let lastDepositTimestamp = 0;

  for (const deposit of data) {
    const ts = deposit.updatedAt.getTime();
    if (ts > lastDepositTimestamp) lastDepositTimestamp = ts;

    const hasOnTime = deposit.withdrawals.some(
      (w) => w.status === 'confirmed' && w.reward != null && w.reward.toNumber() > 0,
    );
    if (hasOnTime) totalCompletedCycles++;
  }

  return { totalCompletedCycles, lastDepositTimestamp };
}

// ---------------------------------------------------------------------------
// Lazy rank lookup
// ---------------------------------------------------------------------------

/**
 * Returns the 1-based rank of walletAddress in the given cycle, or null if
 * the wallet is not in the top 10. Applies the same tiebreaker as the
 * cycle-close pipeline.
 */
export async function getLeaderboardRankForWallet(
  walletAddress: string,
  cycleId: number,
  // Single-network now: kept optional + ignored for back-compat.
  _networkId?: number,
): Promise<number | null> {
  const rows = await getLeaderboard(cycleId);
  const candidates = rows.slice(0, 15);

  const tiebreakerMap = new Map<string, TiebreakerData>();
  await Promise.all(
    candidates.map(async (r) => {
      tiebreakerMap.set(r.walletAddress, await getTiebreakerData(r.walletAddress));
    }),
  );

  const ranked = candidates
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const tA = tiebreakerMap.get(a.walletAddress)!;
      const tB = tiebreakerMap.get(b.walletAddress)!;
      if (tB.totalCompletedCycles !== tA.totalCompletedCycles)
        return tB.totalCompletedCycles - tA.totalCompletedCycles;
      return tA.lastDepositTimestamp - tB.lastDepositTimestamp;
    })
    .slice(0, 10);

  const idx = ranked.findIndex((r) => r.walletAddress === walletAddress);
  return idx === -1 ? null : idx + 1;
}

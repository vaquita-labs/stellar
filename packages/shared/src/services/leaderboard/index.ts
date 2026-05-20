import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Cycle duration config
// ---------------------------------------------------------------------------

/**
 * Returns the fixed cycle duration in milliseconds from CYCLE_DURATION_MS env
 * var, or null in production (calendar month cycles).
 */
export function getCycleDurationMs(): number | null {
  const raw = process.env.CYCLE_DURATION_MS;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Cycle boundary helpers
// ---------------------------------------------------------------------------

/**
 * Converts a cycle ID to UTC start/end millisecond timestamps.
 *
 * - 6-digit YYYYMM → production monthly cycle
 * - 10-digit Unix epoch seconds → test fixed-duration cycle (requires CYCLE_DURATION_MS)
 */
export function cycleIdToBoundaries(cycleId: number): { cycleStart: number; cycleEnd: number } {
  if (cycleId < 1_000_000_000) {
    // YYYYMM format
    const year = Math.floor(cycleId / 100);
    const month = cycleId % 100; // 1-based
    return {
      cycleStart: Date.UTC(year, month - 1, 1),
      cycleEnd:   Date.UTC(year, month,     1),
    };
  }
  // Epoch-seconds: end = start + CYCLE_DURATION_MS
  const durationMs = getCycleDurationMs() ?? 30 * 24 * 60 * 60 * 1000;
  const cycleStart = cycleId * 1000;
  return { cycleStart, cycleEnd: cycleStart + durationMs };
}

/**
 * Returns the cycle ID of the last fully closed cycle.
 *
 * - Without CYCLE_DURATION_MS: previous calendar month as YYYYMM.
 * - With CYCLE_DURATION_MS: the start (epoch-seconds) of the previous
 *   completed fixed-duration cycle.
 */
export function getLastClosedCycleId(): number {
  const durationMs = getCycleDurationMs();
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

// ---------------------------------------------------------------------------
// Leaderboard query
// ---------------------------------------------------------------------------

export interface LeaderboardRow {
  walletAddress: string;
  score: number;          // USDC×seconds (closed + open at query time)
  activeAmount: number;   // total USDC in currently active deposits
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
  networkId: number,
): Promise<LeaderboardRow[]> {
  const { cycleStart, cycleEnd: rawEnd } = cycleIdToBoundaries(cycleId);
  const now = Date.now();
  const cycleEnd = cycleId === 0 ? now : rawEnd;

  // Fetch all confirmed deposits that overlap [cycleStart, cycleEnd)
  const { data: deposits, error } = await supabase
    .from('deposits')
    .select('wallet_address, amount, confirmed_at, withdrawals(confirmed_at, status, reward)')
    .eq('network_id', networkId)
    .eq('status', 'confirmed')
    .lt('confirmed_at', new Date(cycleEnd).toISOString())
    .not('confirmed_at', 'is', null);

  if (error) throw error;

  // Score accumulator per wallet
  const scoreMap = new Map<string, { score: number; activeAmount: number }>();

  for (const deposit of deposits ?? []) {
    const wallet = deposit.wallet_address as string;
    const amount = Number(deposit.amount ?? 0);
    const depositedAt = new Date((deposit.confirmed_at as string)).getTime();

    // Find an on-time confirmed withdrawal (reward > 0)
    const withdrawals = (deposit.withdrawals ?? []) as Array<{
      confirmed_at: string | null;
      status: string;
      reward: string | null;
    }>;

    const onTimeWithdrawal = withdrawals.find(
      (w) => w.status === 'confirmed' && w.reward != null && Number(w.reward) > 0,
    );

    let effectiveEnd: number;
    let isActive: boolean;

    if (onTimeWithdrawal?.confirmed_at) {
      const withdrawnAt = new Date(onTimeWithdrawal.confirmed_at).getTime();
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
  networkId: number,
): Promise<TiebreakerData> {
  const { data, error } = await supabase
    .from('deposits')
    .select('confirmed_at, withdrawals(status, reward)')
    .eq('wallet_address', walletAddress)
    .eq('network_id', networkId)
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: true });

  if (error) throw error;

  let totalCompletedCycles = 0;
  let lastDepositTimestamp = 0;

  for (const deposit of data ?? []) {
    const ts = new Date((deposit.confirmed_at as string)).getTime();
    if (ts > lastDepositTimestamp) lastDepositTimestamp = ts;

    const hasOnTime = (deposit.withdrawals as any[]).some(
      (w) => w.status === 'confirmed' && w.reward != null && Number(w.reward) > 0,
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
  networkId: number,
): Promise<number | null> {
  const rows = await getLeaderboard(cycleId, networkId);
  const candidates = rows.slice(0, 15);

  const tiebreakerMap = new Map<string, TiebreakerData>();
  await Promise.all(
    candidates.map(async (r) => {
      tiebreakerMap.set(r.walletAddress, await getTiebreakerData(r.walletAddress, networkId));
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

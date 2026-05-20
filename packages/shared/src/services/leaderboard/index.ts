import { supabase } from '../../lib/supabase';
import { storeBadgeClaim } from '../badges/claims';
import { getBadgeSigningKeypair, makeClaimExpiry, signBadgeClaim } from '../badges/signer';

// ---------------------------------------------------------------------------
// Cycle boundary helpers
// ---------------------------------------------------------------------------

/**
 * Converts a YYYYMM cycle ID to UTC start/end millisecond timestamps.
 * e.g. 202605 → [2026-05-01T00:00:00Z, 2026-06-01T00:00:00Z)
 */
export function cycleIdToBoundaries(cycleId: number): { cycleStart: number; cycleEnd: number } {
  const year = Math.floor(cycleId / 100);
  const month = cycleId % 100; // 1-based
  const cycleStart = Date.UTC(year, month - 1, 1);
  const cycleEnd = Date.UTC(year, month, 1);
  return { cycleStart, cycleEnd };
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

  // Sort by score desc; tiebreaker applied separately by cycle-close job
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
// Cycle-close pipeline: issue leaderboard signed claims
// ---------------------------------------------------------------------------

const LEADERBOARD_BADGES: Record<number, string> = { 1: 'first-place', 2: 'second-place', 3: 'third-place' };

/**
 * Closes the leaderboard for a given cycle: ranks the top 10, issues signed
 * claims, and stores them in Supabase.
 *
 * - Ranks #1–3: receive a leaderboard badge (first-place/second-place/third-place) + top10
 * - Ranks #4–10: receive a top10 badge
 * - Idempotent: existing claims for (wallet, badge_type, cycleId) are skipped
 */
export async function closeLeaderboardCycle(
  cycleId: number,
  networkId: number,
): Promise<void> {
  const keypair = getBadgeSigningKeypair();
  const rows = await getLeaderboard(cycleId, networkId);

  // Apply tiebreaker to top-10 candidates (fetch slightly more to handle ties)
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
      if (tB.totalCompletedCycles !== tA.totalCompletedCycles) {
        return tB.totalCompletedCycles - tA.totalCompletedCycles;
      }
      return tA.lastDepositTimestamp - tB.lastDepositTimestamp;
    })
    .slice(0, 10);

  for (let i = 0; i < ranked.length; i++) {
    const rank = i + 1;
    const { walletAddress } = ranked[i]!;
    const expiry = makeClaimExpiry();

    // top10 badge (all top-10)
    await issueClaim(keypair, walletAddress, 'top10', cycleId, expiry);

    // leaderboard podium badge (ranks 1–3)
    const podiumBadge = LEADERBOARD_BADGES[rank];
    if (podiumBadge) {
      await issueClaim(keypair, walletAddress, podiumBadge, cycleId, expiry);
    }
  }
}

async function issueClaim(
  keypair: ReturnType<typeof getBadgeSigningKeypair>,
  walletAddress: string,
  badgeType: string,
  cycleId: number,
  expiry: number,
): Promise<void> {
  try {
    // Check for existing claim to stay idempotent
    const { data: existing } = await supabase
      .from('badge_claims')
      .select('id')
      .eq('wallet_address', walletAddress)
      .eq('badge_type', badgeType)
      .eq('cycle_id', cycleId)
      .limit(1)
      .maybeSingle();

    if (existing) return; // already issued

    const signature = signBadgeClaim(walletAddress, badgeType, cycleId, expiry, keypair);
    await storeBadgeClaim({ walletAddress, badgeType, cycleId, expiry, signature });
    console.info(`[leaderboard] Issued ${badgeType} claim for ${walletAddress} (cycle ${cycleId})`);
  } catch (err) {
    console.error(`[leaderboard] Failed to issue ${badgeType} for ${walletAddress}`, err);
  }
}

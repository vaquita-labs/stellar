import { resolveAvatarConfig, type AvatarConfig } from '@vaquita/avatar';
import { prisma } from '@vaquita/db';
import type { Profile } from '../../types';
import { hasNickname } from '../profile/naming';

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
  // Postgres column is BigInt → Prisma returns a JS bigint; narrow to number
  // (cycle durations in ms fit comfortably inside a safe integer).
  const raw = config?.cycleDurationMs;
  const n = raw == null ? null : Number(raw);
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

export interface EnrichedLeaderboardRow extends LeaderboardRow {
  /** Hearts this profile's 3D world has collected. */
  mapLikes: number;
  position: number;
  nickname: string;
  /** The user's character avatar (see @vaquita/avatar). Always resolved
   *  server-side — a profile that never opened the editor gets a stable
   *  wallet-seeded avatar, so clients never have to guess a fallback. */
  avatarConfig: AvatarConfig;
  badges: number;
  streak: number;
  experience: number;
  coins: number;
  cycleStatus: LeaderboardCycleStatus;
}

export interface LeaderboardProfileRollups {
  badgesByProfileId: Map<number, number>;
  streaksByProfileId: Map<number, number>;
  experienceByProfileId: Map<number, number>;
  /** Optional: rows fall back to 0 coins when the rollup isn't provided. */
  coinsByProfileId?: Map<number, number>;
  /** Optional: hearts on each profile's 3D world. Defaults to 0. */
  mapLikesByProfileId?: Map<number, number>;
}

export function enrichLeaderboardRows(
  rows: LeaderboardRow[],
  profiles: Profile[],
  rollups: LeaderboardProfileRollups,
  cycleStatus: LeaderboardCycleStatus,
): EnrichedLeaderboardRow[] {
  const profilesByWallet = new Map(profiles.map((profile) => [profile.wallet_address?.toLowerCase() ?? '', profile]));

  return (
    rows
      .map((row) => ({ row, profile: profilesByWallet.get(row.walletAddress.toLowerCase()) }))
      // The board ranks USERS OF THE APP, and the score is the only thing that
      // comes from deposits. A wallet can hold confirmed deposits without ever
      // having opened the app — the reconciler writes rows straight from
      // on-chain events, and `POST /deposit` carries no session — and one that
      // never signed up has no profile, or a stub with no nickname. That
      // deposit is not a competitor, so it does not take a place.
      //
      // Dropped BEFORE the position is assigned, so the numbers stay
      // consecutive. Filtering afterwards would leave a hole where a row nobody
      // can be shown used to be, and the board would read as broken.
      .filter((entry): entry is { row: LeaderboardRow; profile: Profile } => hasNickname(entry.profile ?? {}))
      .map(({ row, profile }, index) => ({
        position: index + 1,
        ...row,
        nickname: profile.nickname,
        avatarConfig: resolveAvatarConfig(profile.avatar_config, profile.wallet_address ?? row.walletAddress),
        badges: rollups.badgesByProfileId.get(profile.id) ?? 0,
        streak: rollups.streaksByProfileId.get(profile.id) ?? 0,
        experience: rollups.experienceByProfileId.get(profile.id) ?? 0,
        coins: rollups.coinsByProfileId?.get(profile.id) ?? 0,
        mapLikes: rollups.mapLikesByProfileId?.get(profile.id) ?? 0,
        cycleStatus,
      }))
  );
}

// ---------------------------------------------------------------------------
// Pagination / server-side view (search + sort + slice)
// ---------------------------------------------------------------------------

export type LeaderboardSortKey = 'rank' | 'level' | 'streak' | 'badges';
export type LeaderboardSortDirection = 'asc' | 'desc';

export interface LeaderboardPageParams {
  limit: number;
  offset: number;
  search: string;
  sort: LeaderboardSortKey;
  direction: LeaderboardSortDirection;
  /** Wallet whose index within this view should be reported as `meViewIndex`. */
  me?: string;
}

export interface LeaderboardPage {
  rows: EnrichedLeaderboardRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  /** The requester's own row (true rank, independent of the search/sort view),
   *  when a `me` wallet was passed and it is on the board. */
  me?: EnrichedLeaderboardRow | null;
  /** 0-based index of the requester's row *within this view* (search + sort
   *  applied), or null when it isn't in it. `me.position` is a true rank and
   *  only matches this index in the default rank view, so a client that wants
   *  to jump straight to its own page must page off this instead. */
  meViewIndex?: number | null;
}

export const LEADERBOARD_DEFAULT_PAGE_SIZE = 20;
export const LEADERBOARD_MAX_PAGE_SIZE = 100;

const LEADERBOARD_SORT_KEYS: LeaderboardSortKey[] = ['rank', 'level', 'streak', 'badges'];

const firstQueryValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

const parseBoundedInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const raw = firstQueryValue(value);
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

/**
 * Parses the paging/view query params of GET /leaderboard. Every param is
 * optional and clamped, so any junk in the URL degrades to the default view
 * instead of a 400 — the cycle param stays the only validated input.
 */
export function parseLeaderboardPageQuery(query: {
  limit?: unknown;
  offset?: unknown;
  search?: unknown;
  sort?: unknown;
  direction?: unknown;
}): LeaderboardPageParams {
  const rawSearch = firstQueryValue(query.search);
  const rawSort = firstQueryValue(query.sort);
  const rawDirection = firstQueryValue(query.direction);

  return {
    limit: parseBoundedInt(query.limit, LEADERBOARD_DEFAULT_PAGE_SIZE, 1, LEADERBOARD_MAX_PAGE_SIZE),
    offset: parseBoundedInt(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    search: typeof rawSearch === 'string' ? rawSearch.trim() : '',
    sort: LEADERBOARD_SORT_KEYS.includes(rawSort as LeaderboardSortKey)
      ? (rawSort as LeaderboardSortKey)
      : 'rank',
    direction: rawDirection === 'asc' ? 'asc' : 'desc',
  };
}

/** Mirrors the web client's display-handle fallback (`@vaquero<tail>`) so a
 *  search for what the card literally shows still matches profiles without a
 *  nickname. */
const leaderboardSearchHaystack = (row: EnrichedLeaderboardRow): string => {
  const nickname = (row.nickname ?? '').trim().toLowerCase();
  const wallet = row.walletAddress.toLowerCase();
  const fallbackHandle = `vaquero${wallet.slice(-4)}`;
  return `${nickname} ${nickname.replace(/\s+/g, '')} ${wallet} ${fallbackHandle}`;
};

/**
 * Applies the user-facing view (search → sort → page slice) over the fully
 * enriched, rank-ordered leaderboard. Rows keep their original `position`
 * (true rank) regardless of the sort metric, matching the previous client-side
 * behaviour. Sorting happens before slicing so infinite-scroll pages of a
 * non-rank sort stay globally consistent.
 */
export function paginateLeaderboardRows(
  rows: EnrichedLeaderboardRow[],
  params: LeaderboardPageParams,
): LeaderboardPage {
  const { limit, offset, search, sort, direction, me } = params;

  let view = rows;

  if (search) {
    const q = search.toLowerCase().replace(/^@/, '');
    view = view.filter((row) => leaderboardSearchHaystack(row).includes(q));
  }

  if (sort === 'rank') {
    if (direction === 'asc') view = [...view].reverse();
  } else {
    const accessor: Record<Exclude<LeaderboardSortKey, 'rank'>, (r: EnrichedLeaderboardRow) => number> = {
      level: (r) => r.experience,
      streak: (r) => r.streak,
      badges: (r) => r.badges,
    };
    const get = accessor[sort];
    const sign = direction === 'desc' ? -1 : 1;
    // Stable tiebreak on rank so equal metrics keep leaderboard order.
    view = [...view].sort((a, b) => sign * (get(a) - get(b)) || a.position - b.position);
  }

  const total = view.length;
  const pageRows = view.slice(offset, offset + limit);

  // One extra scan over the already-materialised view, so a client can jump to
  // its own page in a single request instead of paging there — at rank 1M that
  // is the difference between one request and fifty thousand.
  let meViewIndex: number | null = null;
  if (me) {
    const needle = me.toLowerCase();
    const found = view.findIndex((row) => row.walletAddress.toLowerCase() === needle);
    meViewIndex = found === -1 ? null : found;
  }

  return {
    rows: pageRows,
    total,
    limit,
    offset,
    hasMore: offset + pageRows.length < total,
    meViewIndex,
  };
}

/**
 * Finds a wallet's enriched row (with its true rank `position`) in the full
 * board. Case-insensitive so the client can pass the wallet as stored locally.
 */
export function findLeaderboardRowForWallet(
  rows: EnrichedLeaderboardRow[],
  walletAddress: string,
): EnrichedLeaderboardRow | null {
  const needle = walletAddress.toLowerCase();
  return rows.find((row) => row.walletAddress.toLowerCase() === needle) ?? null;
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

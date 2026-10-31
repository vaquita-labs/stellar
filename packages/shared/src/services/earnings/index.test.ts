import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  walletBalanceHistory: { findMany: vi.fn() },
  vaultFlow: { findMany: vi.fn() },
}));

vi.mock('@vaquita/db', () => ({ prisma }));

const {
  MAX_BUCKETS,
  bucketsEndingNow,
  computePassiveEarnings,
  earningStretches,
  getPassiveEarnings,
  isValidTimeZone,
} = await import('./index');

const DAY = 86_400_000;
const TZ = 'America/La_Paz'; // UTC-4, no DST
// 2026-10-28 15:00 La Paz = 19:00 UTC
const NOW = Date.UTC(2026, 9, 28, 19, 0, 0);
const midnight = (d: number) => Date.UTC(2026, 9, d, 4, 0, 0);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bucketsEndingNow', () => {
  it('cuts calendar days in the zone, the last one holding now', () => {
    const b = bucketsEndingNow('daily', 3, NOW, TZ);
    expect(b.map((x) => [x.start, x.end])).toEqual([
      [midnight(26), midnight(27)],
      [midnight(27), midnight(28)],
      [midnight(28), midnight(29)],
    ]);
  });

  it('cuts months and years in the zone', () => {
    const m = bucketsEndingNow('monthly', 2, NOW, TZ);
    expect(m[0]!.start).toBe(Date.UTC(2026, 8, 1, 4));
    expect(m[1]!.start).toBe(Date.UTC(2026, 9, 1, 4));
    expect(m[1]!.end).toBe(Date.UTC(2026, 10, 1, 4));
    const y = bucketsEndingNow('yearly', 2, NOW, TZ);
    expect(y.map((x) => new Date(x.start).toISOString())).toEqual(['2025-01-01T04:00:00.000Z', '2026-01-01T04:00:00.000Z']);
  });

  it('follows the zone, not the server clock', () => {
    const tokyo = bucketsEndingNow('daily', 1, NOW, 'Asia/Tokyo'); // 04:00 on the 29th there
    expect(new Date(tokyo[0]!.start).toISOString()).toBe('2026-10-28T15:00:00.000Z');
    expect(isValidTimeZone('Nowhere/Land')).toBe(false);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('shortens the calendar day that springs forward for DST', () => {
    // America/New_York sprang forward on 2026-03-08 at 02:00 local → that day is 23 hours.
    const springForwardAfternoon = Date.UTC(2026, 2, 8, 19, 0, 0); // 15:00 EDT
    const day = bucketsEndingNow('daily', 1, springForwardAfternoon, 'America/New_York')[0]!;
    expect(day.end - day.start).toBe(23 * 3_600_000);

    const nextAfternoon = Date.UTC(2026, 2, 9, 19, 0, 0);
    const next = bucketsEndingNow('daily', 1, nextAfternoon, 'America/New_York')[0]!;
    expect(next.end - next.start).toBe(DAY);
  });

  it('accepts a single bucket and the maximum count', () => {
    expect(bucketsEndingNow('daily', 1, NOW, TZ)).toHaveLength(1);
    expect(bucketsEndingNow('daily', MAX_BUCKETS, NOW, TZ)).toHaveLength(MAX_BUCKETS);
  });
});

describe('earningStretches', () => {
  it('takes the flows back out of the balance delta', () => {
    const samples = [
      { observedAt: 0, balance: 100 },
      { observedAt: DAY, balance: 150.5 }, // +50 deposited, +0.5 earned
      { observedAt: 2 * DAY, balance: 120.7 }, // -30 withdrawn, +0.2 earned
    ];
    const flows = [
      { confirmedAt: DAY / 2, direction: 'deposit' as const, amount: 50 },
      { confirmedAt: DAY * 1.5, direction: 'withdraw' as const, amount: 30 },
    ];
    const s = earningStretches(samples, flows, 2 * DAY);
    expect(s).toHaveLength(2);
    expect(s[0]!.rate * DAY).toBeCloseTo(0.5, 9);
    expect(s[1]!.rate * DAY).toBeCloseTo(0.2, 9);
  });

  it('nets a deposit and a withdraw inside the same stretch', () => {
    // +40 deposit, -10 withdraw, balance rose by 31 → 1 earned.
    const samples = [
      { observedAt: 0, balance: 100 },
      { observedAt: DAY, balance: 131 },
    ];
    const flows = [
      { confirmedAt: DAY / 3, direction: 'deposit' as const, amount: 40 },
      { confirmedAt: (2 * DAY) / 3, direction: 'withdraw' as const, amount: 10 },
    ];
    const s = earningStretches(samples, flows, DAY);
    expect(s).toHaveLength(1);
    expect(s[0]!.rate * DAY).toBeCloseTo(1, 9);
  });

  it('counts a flow confirmed exactly on the later sample, and ignores one before the first', () => {
    const samples = [
      { observedAt: DAY, balance: 100 },
      { observedAt: 2 * DAY, balance: 160 },
    ];
    const flows = [
      { confirmedAt: DAY - 1, direction: 'deposit' as const, amount: 99 }, // before the stretch
      { confirmedAt: 2 * DAY, direction: 'deposit' as const, amount: 50 }, // on the later sample
    ];
    const s = earningStretches(samples, flows, 2 * DAY);
    expect(s).toHaveLength(1);
    expect(s[0]!.rate * DAY).toBeCloseTo(10, 9); // 160 - 100 - 50
  });

  it('never reports a loss, and carries the last pace to now', () => {
    const samples = [
      { observedAt: 0, balance: 100 },
      { observedAt: DAY, balance: 90 }, // a withdrawal nobody recorded
      { observedAt: 2 * DAY, balance: 91 },
    ];
    const s = earningStretches(samples, [], 3 * DAY);
    expect(s[0]!.rate).toBe(0);
    expect(s[1]!.rate * DAY).toBeCloseTo(1, 9);
    expect(s[2]).toEqual({ from: 2 * DAY, to: 3 * DAY, rate: s[1]!.rate });
  });

  it('treats an unrecorded drop as zero even when a partial flow is present', () => {
    // Balance fell by 20 while only 5 was withdrawn on record → remaining 15 is not a loss.
    const samples = [
      { observedAt: 0, balance: 100 },
      { observedAt: DAY, balance: 80 },
    ];
    const flows = [{ confirmedAt: DAY / 2, direction: 'withdraw' as const, amount: 5 }];
    const s = earningStretches(samples, flows, DAY);
    expect(s[0]!.rate).toBe(0);
  });

  it('is empty with one sample or none', () => {
    expect(earningStretches([], [], DAY)).toEqual([]);
    expect(earningStretches([{ observedAt: 0, balance: 5 }], [], DAY)).toEqual([{ from: 0, to: DAY, rate: 0 }]);
  });
});

describe('computePassiveEarnings', () => {
  it('spreads a stretch over the days it covers and flags the days without a sample', () => {
    // Samples at 15:00 on the 25th and 15:00 on the 27th: 2 USDC over two days.
    const samples = [
      { observedAt: midnight(25) + 15 * 3_600_000, balance: 100 },
      { observedAt: midnight(27) + 15 * 3_600_000, balance: 102 },
    ];
    const out = computePassiveEarnings({ samples, flows: [], period: 'daily', count: 4, timeZone: TZ, now: NOW });
    const byDay = Object.fromEntries(out.buckets.map((b) => [new Date(b.start).getUTCDate(), b]));
    expect(byDay[25]!.earned).toBeCloseTo(9 / 24, 6); // 15:00 to midnight at 1/day
    expect(byDay[25]!.estimated).toBe(false);
    expect(byDay[26]!.earned).toBeCloseTo(1, 6);
    expect(byDay[26]!.estimated).toBe(true); // nothing measured that day
    expect(byDay[27]!.earned).toBeCloseTo(15 / 24 + 9 / 24, 6); // to the sample, then carried forward at the same pace
    expect(byDay[27]!.estimated).toBe(false);
    expect(byDay[28]!.earned).toBeCloseTo(15 / 24, 6); // carried forward until 15:00 today
    expect(byDay[28]!.estimated).toBe(true);
    expect(out.totalEarned).toBeCloseTo(3, 6);
    expect(out.firstSampleAt).toBe(new Date(samples[0]!.observedAt).toISOString());
    expect(out.currency).toBe('USDC');
  });

  it('says there is nothing before the first sample', () => {
    const out = computePassiveEarnings({ samples: [], flows: [], period: 'monthly', count: 2, timeZone: TZ, now: NOW });
    expect(out.buckets.every((b) => b.earned === 0 && b.estimated)).toBe(true);
    expect(out.totalEarned).toBe(0);
    expect(out.firstSampleAt).toBeNull();
  });
});

describe('getPassiveEarnings', () => {
  const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const now = Date.UTC(2026, 9, 28, 19, 0, 0);

  it('sums blend and vault on each sample and ignores soft-deleted flows', async () => {
    const t0 = new Date(now - 2 * DAY);
    const t1 = new Date(now - DAY);
    prisma.walletBalanceHistory.findMany.mockResolvedValue([
      { observedAt: t0, blendUsdc: 40, vaultUsdc: 60 },
      { observedAt: t1, blendUsdc: 0, vaultUsdc: 110.5 },
    ]);
    prisma.vaultFlow.findMany.mockResolvedValue([
      { confirmedAt: new Date(now - DAY * 1.5), direction: 'deposit', amount: 10 },
    ]);

    const out = await getPassiveEarnings({
      walletAddress: WALLET,
      tokenId: 2,
      period: 'daily',
      count: 3,
      timeZone: TZ,
      now,
    });

    expect(prisma.walletBalanceHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ walletAddress: WALLET, tokenId: 2 }),
      }),
    );
    expect(prisma.vaultFlow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          walletAddress: WALLET,
          tokenId: 2,
          deletedAt: null,
          confirmedAt: { gt: t0, lte: new Date(now) },
        }),
      }),
    );
    // 110.5 - 100 - 10 deposit = 0.5 earned over one day, then carried forward another day.
    expect(out.totalEarned).toBeCloseTo(1, 6);
    expect(out.firstSampleAt).toBe(t0.toISOString());
  });

  it('skips the flow query and reports zero when there are no samples', async () => {
    prisma.walletBalanceHistory.findMany.mockResolvedValue([]);

    const out = await getPassiveEarnings({
      walletAddress: WALLET,
      tokenId: 2,
      period: 'daily',
      count: 2,
      timeZone: TZ,
      now,
    });

    expect(prisma.vaultFlow.findMany).not.toHaveBeenCalled();
    expect(out.totalEarned).toBe(0);
    expect(out.firstSampleAt).toBeNull();
    expect(out.buckets).toHaveLength(2);
  });
});

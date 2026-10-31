import { describe, expect, it, vi } from 'vitest';

vi.mock('@vaquita/db', () => ({ prisma: {} }));

const { bucketsEndingNow, computePassiveEarnings, earningStretches, isValidTimeZone } = await import('./index');

const DAY = 86_400_000;
const TZ = 'America/La_Paz'; // UTC-4, no DST
// 2026-10-28 15:00 La Paz = 19:00 UTC
const NOW = Date.UTC(2026, 9, 28, 19, 0, 0);
const midnight = (d: number) => Date.UTC(2026, 9, d, 4, 0, 0);

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

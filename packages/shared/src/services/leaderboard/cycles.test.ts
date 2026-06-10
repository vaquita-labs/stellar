import { beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
  cycleDurationMs: null as number | null,
}));

vi.mock('@vaquita/db', () => ({
  prisma: {
    config: {
      findFirst: vi.fn(async () => ({ cycleDurationMs: config.cycleDurationMs })),
    },
  },
}));

import {
  cycleIdToBoundaries,
  getCurrentCycleId,
  getLastClosedCycleId,
  parseLeaderboardCycleQuery,
} from './index';

describe('leaderboard cycle helpers', () => {
  beforeEach(() => {
    config.cycleDurationMs = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));
  });

  it('uses UTC calendar months when cycle_duration_ms is null', async () => {
    await expect(getCurrentCycleId()).resolves.toBe(202606);
    await expect(getLastClosedCycleId()).resolves.toBe(202605);
    await expect(cycleIdToBoundaries(202606)).resolves.toEqual({
      cycleStart: Date.UTC(2026, 5, 1),
      cycleEnd: Date.UTC(2026, 6, 1),
    });
  });

  it('uses fixed-duration cycle starts when cycle_duration_ms is configured', async () => {
    config.cycleDurationMs = 7 * 24 * 60 * 60 * 1000;
    vi.setSystemTime(new Date('1970-01-15T12:00:00Z'));

    await expect(getCurrentCycleId()).resolves.toBe(1_209_600);
    await expect(getLastClosedCycleId()).resolves.toBe(604_800);
    await expect(cycleIdToBoundaries(1_209_600)).resolves.toEqual({
      cycleStart: 1_209_600_000,
      cycleEnd: 1_814_400_000,
    });
  });

  it('parses leaderboard query modes', async () => {
    await expect(parseLeaderboardCycleQuery(undefined)).resolves.toEqual({
      cycleId: 202606,
      cycleStatus: 'current',
    });
    await expect(parseLeaderboardCycleQuery('current')).resolves.toEqual({
      cycleId: 202606,
      cycleStatus: 'current',
    });
    await expect(parseLeaderboardCycleQuery('last_closed')).resolves.toEqual({
      cycleId: 202605,
      cycleStatus: 'last_closed',
    });
    await expect(parseLeaderboardCycleQuery('202604')).resolves.toEqual({
      cycleId: 202604,
      cycleStatus: 'historical',
    });
  });

  it('rejects invalid leaderboard cycle query values', async () => {
    await expect(parseLeaderboardCycleQuery('banana')).rejects.toThrow(
      'cycle must be current, last_closed, or a positive integer cycle id',
    );
    await expect(parseLeaderboardCycleQuery('0')).rejects.toThrow(
      'cycle must be current, last_closed, or a positive integer cycle id',
    );
  });
});

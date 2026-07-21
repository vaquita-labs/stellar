import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getLeaderboard = vi.fn();
const getProfiles = vi.fn();

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  getLeaderboard: (...args: unknown[]) => getLeaderboard(...args),
}));

vi.mock('../profile', () => ({
  getProfiles: (...args: unknown[]) => getProfiles(...args),
  getAchievementCountsByProfile: async () => ({ counts: new Map(), error: null }),
  getStreakCountsByProfile: async () => ({ counts: new Map(), error: null }),
  getExperienceByProfile: async () => ({ experience: new Map(), error: null }),
  getCoinsByProfile: async () => ({ counts: new Map(), error: null }),
}));

import { clearEnrichedLeaderboardCache, getEnrichedLeaderboard } from './enriched';

const scoreRow = (walletAddress: string) => ({
  walletAddress,
  score: 1,
  activeAmount: 1,
  cycleId: 202606,
  cycleStart: 1,
  cycleEnd: 2,
});

beforeEach(() => {
  vi.useFakeTimers();
  clearEnrichedLeaderboardCache();
  getLeaderboard.mockReset().mockResolvedValue([scoreRow('GA')]);
  getProfiles.mockReset().mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getEnrichedLeaderboard', () => {
  it('computes once per TTL window and rebuilds after expiry', async () => {
    const first = await getEnrichedLeaderboard(202606, 'current');
    expect(first).toHaveLength(1);
    expect(getLeaderboard).toHaveBeenCalledTimes(1);

    await getEnrichedLeaderboard(202606, 'current');
    expect(getLeaderboard).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(31_000);
    await getEnrichedLeaderboard(202606, 'current');
    expect(getLeaderboard).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight build across concurrent requests', async () => {
    let release!: (rows: ReturnType<typeof scoreRow>[]) => void;
    getLeaderboard.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const a = getEnrichedLeaderboard(202606, 'current');
    const b = getEnrichedLeaderboard(202606, 'current');
    expect(getLeaderboard).toHaveBeenCalledTimes(1);

    release([scoreRow('GA')]);
    const [rowsA, rowsB] = await Promise.all([a, b]);
    expect(rowsA).toEqual(rowsB);
  });

  it('evicts a failed build so the next request retries', async () => {
    getProfiles.mockResolvedValueOnce({ data: [], error: new Error('db down') });

    await expect(getEnrichedLeaderboard(202606, 'current')).rejects.toThrow(
      'Failed to load profile metadata for leaderboard',
    );

    const rows = await getEnrichedLeaderboard(202606, 'current');
    expect(rows).toHaveLength(1);
    expect(getLeaderboard).toHaveBeenCalledTimes(2);
  });

  it('caches per cycle independently', async () => {
    await getEnrichedLeaderboard(202605, 'historical');
    await getEnrichedLeaderboard(202606, 'current');
    expect(getLeaderboard).toHaveBeenCalledTimes(2);
    expect(getLeaderboard).toHaveBeenNthCalledWith(1, 202605);
    expect(getLeaderboard).toHaveBeenNthCalledWith(2, 202606);
  });
});

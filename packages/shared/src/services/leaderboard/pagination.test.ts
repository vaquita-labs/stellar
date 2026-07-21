import { describe, expect, it } from 'vitest';

import type { EnrichedLeaderboardRow, LeaderboardPageParams } from './index';
import {
  LEADERBOARD_DEFAULT_PAGE_SIZE,
  LEADERBOARD_MAX_PAGE_SIZE,
  paginateLeaderboardRows,
  parseLeaderboardPageQuery,
} from './index';
import { defaultAvatarConfig } from '@vaquita/avatar';

const row = (overrides: Partial<EnrichedLeaderboardRow>): EnrichedLeaderboardRow => ({
  position: 1,
  walletAddress: 'GA',
  nickname: '',
  avatarConfig: defaultAvatarConfig(),
  mapLikes: 0,
  badges: 0,
  streak: 0,
  experience: 0,
  coins: 0,
  score: 0,
  activeAmount: 0,
  cycleId: 202606,
  cycleStart: 1,
  cycleEnd: 2,
  cycleStatus: 'current',
  ...overrides,
});

const params = (overrides: Partial<LeaderboardPageParams>): LeaderboardPageParams => ({
  limit: LEADERBOARD_DEFAULT_PAGE_SIZE,
  offset: 0,
  search: '',
  sort: 'rank',
  direction: 'desc',
  ...overrides,
});

describe('parseLeaderboardPageQuery', () => {
  it('falls back to defaults for missing or junk params', () => {
    expect(parseLeaderboardPageQuery({})).toEqual({
      limit: LEADERBOARD_DEFAULT_PAGE_SIZE,
      offset: 0,
      search: '',
      sort: 'rank',
      direction: 'desc',
    });
    expect(
      parseLeaderboardPageQuery({ limit: 'nope', offset: '-3', sort: 'hax', direction: 'up' }),
    ).toEqual({
      limit: LEADERBOARD_DEFAULT_PAGE_SIZE,
      offset: 0,
      search: '',
      sort: 'rank',
      direction: 'desc',
    });
  });

  it('clamps limit and accepts valid view params', () => {
    expect(
      parseLeaderboardPageQuery({
        limit: '9999',
        offset: '40',
        search: '  Ana ',
        sort: 'streak',
        direction: 'asc',
      }),
    ).toEqual({
      limit: LEADERBOARD_MAX_PAGE_SIZE,
      offset: 40,
      search: 'Ana',
      sort: 'streak',
      direction: 'asc',
    });
  });
});

describe('paginateLeaderboardRows', () => {
  const rows = [
    row({ position: 1, walletAddress: 'GAAA', nickname: 'Ana', experience: 100, streak: 1, badges: 5 }),
    row({ position: 2, walletAddress: 'GBBB', nickname: 'Bea', experience: 300, streak: 9, badges: 5 }),
    row({ position: 3, walletAddress: 'GCCC', nickname: '', experience: 200, streak: 4, badges: 1 }),
  ];

  it('slices pages and reports hasMore/total', () => {
    const page1 = paginateLeaderboardRows(rows, params({ limit: 2, offset: 0 }));
    expect(page1.rows.map((r) => r.walletAddress)).toEqual(['GAAA', 'GBBB']);
    expect(page1).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });

    const page2 = paginateLeaderboardRows(rows, params({ limit: 2, offset: 2 }));
    expect(page2.rows.map((r) => r.walletAddress)).toEqual(['GCCC']);
    expect(page2.hasMore).toBe(false);
  });

  it('sorts by metric globally before slicing, keeping true rank positions', () => {
    const page = paginateLeaderboardRows(rows, params({ limit: 2, sort: 'level' }));
    expect(page.rows.map((r) => r.walletAddress)).toEqual(['GBBB', 'GCCC']);
    expect(page.rows.map((r) => r.position)).toEqual([2, 3]);
  });

  it('breaks metric ties by rank and honours asc direction', () => {
    const byBadgesAsc = paginateLeaderboardRows(rows, params({ sort: 'badges', direction: 'asc' }));
    expect(byBadgesAsc.rows.map((r) => r.walletAddress)).toEqual(['GCCC', 'GAAA', 'GBBB']);

    const rankAsc = paginateLeaderboardRows(rows, params({ direction: 'asc' }));
    expect(rankAsc.rows.map((r) => r.position)).toEqual([3, 2, 1]);
  });

  it('matches nickname and the @vaquero wallet-tail fallback handle', () => {
    const byNickname = paginateLeaderboardRows(rows, params({ search: '@ana' }));
    expect(byNickname.rows.map((r) => r.walletAddress)).toEqual(['GAAA']);

    const byFallback = paginateLeaderboardRows(rows, params({ search: 'vaquerogccc' }));
    expect(byFallback.rows.map((r) => r.walletAddress)).toEqual(['GCCC']);

    expect(paginateLeaderboardRows(rows, params({ search: 'zzz' }))).toMatchObject({
      rows: [],
      total: 0,
      hasMore: false,
    });
  });
});

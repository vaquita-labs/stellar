import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The board's whole job is ordering and identity, so the fixture is a profile
 * table and a set of saving wallets — everything else is arithmetic on those.
 */
const db = vi.hoisted(() => ({
  /** `referredById` per referred wallet. */
  edges: [] as { walletAddress: string; referredById: number }[],
  referrers: [] as { id: number; walletAddress: string; nickname: string | null }[],
  /** Referred wallets that currently hold a live locked deposit. */
  lockedWallets: [] as string[],
  /** Referred wallets with a positive flexible-vault balance. */
  vaultWallets: [] as string[],
}));

vi.mock('@vaquita/db', () => ({
  prisma: {
    profile: {
      findMany: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select?: unknown }) => {
        void select;
        // The two reads are told apart by what they filter on: the attribution
        // edges by `referredById`, the referrers themselves by `id`.
        if ('referredById' in where) return db.edges;
        const ids = (where.id as { in: number[] }).in;
        return db.referrers
          .filter((r) => ids.includes(r.id))
          .map((r) => ({ ...r, avatarConfig: null }));
      }),
    },
    deposit: {
      groupBy: vi.fn(async ({ where }: { where: { walletAddress: { in: string[] } } }) =>
        db.lockedWallets
          .filter((wallet) => where.walletAddress.in.includes(wallet))
          .map((walletAddress) => ({ walletAddress })),
      ),
    },
    walletBalance: {
      findMany: vi.fn(async ({ where }: { where: { walletAddress: { in: string[] } } }) =>
        db.vaultWallets
          .filter((wallet) => where.walletAddress.in.includes(wallet))
          .map((walletAddress) => ({ walletAddress })),
      ),
    },
  },
}));

vi.mock('../wallets/onchainBalances', () => ({
  getSupportedTokenIds: vi.fn(async () => [2]),
}));

import { REFERRER_BOARD_SIZE, clearReferrerBoardCache, getReferrerLeaderboard } from './index';

/** `n` referrers, the first bringing `n` friends, the next `n - 1`, and so on. */
const seedDescending = (n: number) => {
  db.referrers = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    walletAddress: `G_REFERRER_${i + 1}`,
    nickname: `referrer_${i + 1}`,
  }));
  db.edges = db.referrers.flatMap((referrer, i) =>
    Array.from({ length: n - i }, (_, j) => ({
      walletAddress: `G_FRIEND_${i + 1}_${j + 1}`,
      referredById: referrer.id,
    })),
  );
};

beforeEach(() => {
  db.edges = [];
  db.referrers = [];
  db.lockedWallets = [];
  db.vaultWallets = [];
  clearReferrerBoardCache();
});

describe('referrer leaderboard', () => {
  it('is empty when nobody has referred anyone', async () => {
    await expect(getReferrerLeaderboard('G_ANYONE')).resolves.toEqual({ rows: [], me: null, total: 0 });
  });

  it('ranks by friends joined and counts saving in either product', async () => {
    db.referrers = [
      { id: 1, walletAddress: 'G_ONE', nickname: 'one' },
      { id: 2, walletAddress: 'G_TWO', nickname: 'two' },
    ];
    db.edges = [
      { walletAddress: 'G_A', referredById: 2 },
      { walletAddress: 'G_B', referredById: 2 },
      { walletAddress: 'G_C', referredById: 2 },
      { walletAddress: 'G_D', referredById: 1 },
    ];
    // One locked, one flexible, one saving in both — three wallets, not four.
    db.lockedWallets = ['G_A', 'G_B'];
    db.vaultWallets = ['G_B', 'G_C'];

    const board = await getReferrerLeaderboard('G_ONE');

    expect(board.rows.map((r) => [r.position, r.nickname, r.referrals, r.activeReferrals])).toEqual([
      [1, 'two', 3, 3],
      [2, 'one', 1, 0],
    ]);
    expect(board.total).toBe(2);
  });

  it('drops a nickname-less referrer before positions are assigned', async () => {
    db.referrers = [
      { id: 1, walletAddress: 'G_ONE', nickname: 'one' },
      { id: 2, walletAddress: 'G_HIDDEN', nickname: null },
      { id: 3, walletAddress: 'G_THREE', nickname: 'three' },
    ];
    db.edges = [
      { walletAddress: 'G_A', referredById: 2 },
      { walletAddress: 'G_B', referredById: 2 },
      { walletAddress: 'G_C', referredById: 2 },
      { walletAddress: 'G_D', referredById: 1 },
      { walletAddress: 'G_E', referredById: 1 },
      { walletAddress: 'G_F', referredById: 3 },
    ];

    const board = await getReferrerLeaderboard('G_HIDDEN');

    // Consecutive ranks, and the dropped referrer is not the viewer's own row
    // either: there is no name to put on a public board.
    expect(board.rows.map((r) => r.position)).toEqual([1, 2]);
    expect(board.rows.map((r) => r.nickname)).toEqual(['one', 'three']);
    expect(board.me).toBeNull();
    expect(board.total).toBe(2);
  });

  it('breaks a tie on saving, then on nickname', async () => {
    db.referrers = [
      { id: 1, walletAddress: 'G_B', nickname: 'bravo' },
      { id: 2, walletAddress: 'G_A', nickname: 'alpha' },
      { id: 3, walletAddress: 'G_S', nickname: 'saver' },
    ];
    db.edges = [
      { walletAddress: 'G_1', referredById: 1 },
      { walletAddress: 'G_2', referredById: 2 },
      { walletAddress: 'G_3', referredById: 3 },
    ];
    db.lockedWallets = ['G_3'];

    const board = await getReferrerLeaderboard('G_A');

    expect(board.rows.map((r) => r.nickname)).toEqual(['saver', 'alpha', 'bravo']);
  });

  it('marks the viewer inside the board and pins their row when outside it', async () => {
    seedDescending(REFERRER_BOARD_SIZE + 5);

    const inside = await getReferrerLeaderboard('G_REFERRER_1');
    expect(inside.rows).toHaveLength(REFERRER_BOARD_SIZE);
    expect(inside.rows.filter((r) => r.isCurrentUser).map((r) => r.position)).toEqual([1]);
    expect(inside.me?.position).toBe(1);

    clearReferrerBoardCache();
    const outside = await getReferrerLeaderboard('G_REFERRER_33');
    expect(outside.rows.some((r) => r.isCurrentUser)).toBe(false);
    // A true rank over every referrer, not an index into the slice.
    expect(outside.me).toMatchObject({ position: 33, nickname: 'referrer_33', isCurrentUser: true });
    expect(outside.total).toBe(REFERRER_BOARD_SIZE + 5);
  });

  it('is case-insensitive about which row belongs to the viewer', async () => {
    db.referrers = [{ id: 1, walletAddress: 'G_MiXeD', nickname: 'mixed' }];
    db.edges = [{ walletAddress: 'G_A', referredById: 1 }];

    const board = await getReferrerLeaderboard('g_mixed');
    expect(board.me?.isCurrentUser).toBe(true);
  });
});

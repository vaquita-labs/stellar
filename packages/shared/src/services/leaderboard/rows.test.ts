import { describe, expect, it } from 'vitest';

import type { Profile } from '../../types';
import { enrichLeaderboardRows } from './index';

const profile = (overrides: Partial<Profile>): Profile => ({
  id: 1,
  network_id: 0,
  email: '',
  full_name: '',
  nickname: '',
  wallet_address: '',
  avatar_config: null,
  onboarding_completed: true,
  tutorial_completed: true,
  home_tour_completed: true,
  crypto_savvy: true,
  language: null,
  currency: null,
  notification_preferences: null,
  created_at: '',
  updated_at: '',
  ...overrides,
});

/** A scored row as `getLeaderboard` hands it over: a wallet and its cycle score,
 *  with no idea of whether anyone is behind the wallet. */
const score = (walletAddress: string, value: number) => ({
  walletAddress,
  score: value,
  activeAmount: value / 5,
  cycleId: 202606,
  cycleStart: 1,
  cycleEnd: 2,
});

const emptyRollups = {
  badgesByProfileId: new Map<number, number>(),
  streaksByProfileId: new Map<number, number>(),
  experienceByProfileId: new Map<number, number>(),
};

describe('enrichLeaderboardRows', () => {
  it('keeps backend rank order while adding profile display rollups', () => {
    const rows = enrichLeaderboardRows(
      [
        {
          walletAddress: 'GB',
          score: 200,
          activeAmount: 50,
          cycleId: 202606,
          cycleStart: 1,
          cycleEnd: 2,
        },
        {
          walletAddress: 'GA',
          score: 100,
          activeAmount: 20,
          cycleId: 202606,
          cycleStart: 1,
          cycleEnd: 2,
        },
      ],
      [
        profile({ id: 10, wallet_address: 'GA', nickname: 'Ana', avatar_config: { v: 1, hair: 'afro' } }),
        profile({ id: 20, wallet_address: 'GB', nickname: 'Bea', avatar_config: { v: 1, hair: 'bun' } }),
      ],
      {
        badgesByProfileId: new Map([[20, 3]]),
        streaksByProfileId: new Map([[20, 7]]),
        experienceByProfileId: new Map([[20, 450]]),
      },
      'current',
    );

    expect(rows).toEqual([
      expect.objectContaining({
        position: 1,
        walletAddress: 'GB',
        nickname: 'Bea',
        avatarConfig: expect.objectContaining({ hair: 'bun' }),
        badges: 3,
        streak: 7,
        experience: 450,
        cycleStatus: 'current',
      }),
      expect.objectContaining({
        position: 2,
        walletAddress: 'GA',
        nickname: 'Ana',
        avatarConfig: expect.objectContaining({ hair: 'afro' }),
        badges: 0,
        streak: 0,
        experience: 0,
      }),
    ]);
  });

  // The board ranks app users. A wallet can hold confirmed deposits without
  // ever having opened the app: the reconciler writes rows from on-chain
  // events, and the deposit endpoint carries no session.
  it('leaves out a wallet that has no profile', () => {
    const rows = enrichLeaderboardRows(
      [score('GA', 100), score('GNOBODY', 300)],
      [profile({ id: 10, wallet_address: 'GA', nickname: 'Ana' })],
      emptyRollups,
      'current',
    );

    expect(rows.map((r) => r.walletAddress)).toEqual(['GA']);
  });

  it('leaves out a stub profile with no nickname', () => {
    const rows = enrichLeaderboardRows(
      [score('GA', 100), score('GB', 300)],
      [
        profile({ id: 10, wallet_address: 'GA', nickname: 'Ana' }),
        profile({ id: 20, wallet_address: 'GB', nickname: '   ' }),
      ],
      emptyRollups,
      'current',
    );

    expect(rows.map((r) => r.walletAddress)).toEqual(['GA']);
  });

  // Dropped before the numbering, so the board has no holes in it.
  it('numbers the surviving rows consecutively', () => {
    const rows = enrichLeaderboardRows(
      [score('GA', 300), score('GNOBODY', 200), score('GB', 100)],
      [
        profile({ id: 10, wallet_address: 'GA', nickname: 'Ana' }),
        profile({ id: 20, wallet_address: 'GB', nickname: 'Bea' }),
      ],
      emptyRollups,
      'current',
    );

    expect(rows.map((r) => [r.position, r.nickname])).toEqual([
      [1, 'Ana'],
      [2, 'Bea'],
    ]);
  });
});

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
  avatar_url: null,
  avatar_key: null,
  onboarding_completed: true,
  tutorial_completed: true,
  crypto_savvy: true,
  language: null,
  currency: null,
  notification_preferences: null,
  created_at: '',
  updated_at: '',
  ...overrides,
});

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
        profile({ id: 10, wallet_address: 'GA', nickname: 'Ana', avatar_url: 'ana.png' }),
        profile({ id: 20, wallet_address: 'GB', nickname: 'Bea', avatar_url: 'bea.png' }),
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
        avatarUrl: 'bea.png',
        badges: 3,
        streak: 7,
        experience: 450,
        cycleStatus: 'current',
      }),
      expect.objectContaining({
        position: 2,
        walletAddress: 'GA',
        nickname: 'Ana',
        avatarUrl: 'ana.png',
        badges: 0,
        streak: 0,
        experience: 0,
      }),
    ]);
  });
});

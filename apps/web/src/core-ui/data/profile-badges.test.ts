import { describe, expect, it } from 'vitest';

import { Achievement } from '../types';
import { type AchievementsCtx, FALLBACK_BADGE_META, buildAchievements } from './profile-badges';

// buildAchievements layers client-side progress onto the badge list, and it
// finds that progress by key. The keys come from the backend spelled with
// underscores; the milestone table is written by hand. When the two disagree
// the lookup misses, `progress` comes back undefined, and the badge simply
// renders without its progress bar — no error, no warning.

const ctx = (over: Partial<AchievementsCtx> = {}): AchievementsCtx => ({
  totalStreak: 0,
  totalDeposits: 0,
  experience: 0,
  ...over,
});

const byId = (id: string, list = buildAchievements(ctx())) => list.find((b) => b.id === id);

describe('buildAchievements', () => {
  it('falls back to the static catalog while the wallet list is empty', () => {
    const badges = buildAchievements(ctx());
    expect(badges.map((b) => b.id)).toEqual(FALLBACK_BADGE_META.map((m) => m.id));
  });

  it('attaches progress to the milestone badges', () => {
    const badges = buildAchievements(ctx({ totalStreak: 3, totalDeposits: 2, experience: 20 }));

    expect(byId(Achievement.WEEK_WARRIOR, badges)?.progress).toEqual({ current: 3, target: 7 });
    expect(byId(Achievement.TRIO_SAVER, badges)?.progress).toEqual({ current: 2, target: 3 });
    expect(byId(Achievement.ROOKIE, badges)?.progress).toEqual({ current: 20, target: 50 });
  });

  it('caps progress at the target instead of overflowing it', () => {
    const badges = buildAchievements(ctx({ totalStreak: 999 }));
    expect(byId(Achievement.WEEK_WARRIOR, badges)?.progress).toEqual({ current: 7, target: 7 });
  });

  it('unlocks a badge once its threshold is met', () => {
    expect(byId(Achievement.WEEK_WARRIOR, buildAchievements(ctx({ totalStreak: 6 })))?.unlocked).toBe(false);
    expect(byId(Achievement.WEEK_WARRIOR, buildAchievements(ctx({ totalStreak: 7 })))?.unlocked).toBe(true);

    expect(byId(Achievement.FIRST_DEPOSIT, buildAchievements(ctx()))?.unlocked).toBe(false);
    expect(byId(Achievement.FIRST_DEPOSIT, buildAchievements(ctx({ totalDeposits: 1 })))?.unlocked).toBe(true);
  });

  it('reads the signals that arrive as optional fields', () => {
    const badges = buildAchievements(ctx({ totalSavedAmount: 100, friendsCount: 1, isBetaTester: true }));

    expect(byId(Achievement.SAVINGS_STARTER, badges)?.unlocked).toBe(true);
    expect(byId(Achievement.FIRST_FRIEND, badges)?.unlocked).toBe(true);
    expect(byId(Achievement.BETA_TESTER, badges)?.unlocked).toBe(true);
  });

  // The milestone table is keyed by hand, so a key that drifts from the shared
  // enum is the exact mistake this whole file exists to catch.
  it('keys the static catalog with the shared Achievement values', () => {
    const known = new Set<string>(Object.values(Achievement));
    const unknown = FALLBACK_BADGE_META.map((m) => m.id).filter((id) => !known.has(id));
    expect(unknown, 'catalog ids missing from the Achievement enum').toEqual([]);
  });
});

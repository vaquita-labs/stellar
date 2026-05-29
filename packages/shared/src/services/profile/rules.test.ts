import { describe, expect, it } from 'vitest';

import type { EligibilitySignals } from './index';
import { badgeRuleSchema, evaluateRule, opsForKind, parseBadgeRule } from './rules';

const signals = (over: Partial<EligibilitySignals> = {}): EligibilitySignals => ({
  createdAt: null,
  experience: 0,
  streakCount: 0,
  activeDeposits: 0,
  activeAmount: 0,
  friendsCount: 0,
  ...over,
});

describe('evaluateRule', () => {
  it('returns false for an absent or empty rule', () => {
    expect(evaluateRule(null, signals())).toBe(false);
    expect(evaluateRule(undefined, signals())).toBe(false);
    expect(evaluateRule({ all: [] }, signals())).toBe(false);
  });

  it('matches the backfilled numeric milestone thresholds', () => {
    // rookie: experience >= 50
    const rookie = { all: [{ signal: 'experience', op: '>=' as const, value: 50 }] };
    expect(evaluateRule(rookie, signals({ experience: 49 }))).toBe(false);
    expect(evaluateRule(rookie, signals({ experience: 50 }))).toBe(true);

    // week-warrior: streakCount >= 7
    const week = { all: [{ signal: 'streakCount', op: '>=' as const, value: 7 }] };
    expect(evaluateRule(week, signals({ streakCount: 6 }))).toBe(false);
    expect(evaluateRule(week, signals({ streakCount: 7 }))).toBe(true);

    // savings-baron: activeAmount >= 10000
    const baron = { all: [{ signal: 'activeAmount', op: '>=' as const, value: 10000 }] };
    expect(evaluateRule(baron, signals({ activeAmount: 9999 }))).toBe(false);
    expect(evaluateRule(baron, signals({ activeAmount: 10000 }))).toBe(true);
  });

  it('ANDs every condition', () => {
    const rule = {
      all: [
        { signal: 'experience', op: '>=' as const, value: 500 },
        { signal: 'streakCount', op: '>=' as const, value: 14 },
      ],
    };
    expect(evaluateRule(rule, signals({ experience: 500, streakCount: 13 }))).toBe(false);
    expect(evaluateRule(rule, signals({ experience: 500, streakCount: 14 }))).toBe(true);
  });

  it('treats a missing signal value (e.g. leaderboardRank) as not eligible', () => {
    const rule = { all: [{ signal: 'leaderboardRank', op: '==' as const, value: 1 }] };
    expect(evaluateRule(rule, signals())).toBe(false);
    expect(evaluateRule(rule, signals({ leaderboardRank: 1 }))).toBe(true);
  });

  it('honors the beta-tester date cutoff with inclusive "before"', () => {
    const rule = {
      all: [{ signal: 'createdAt', op: 'before' as const, value: '2026-05-17T23:59:59Z' }],
    };
    expect(evaluateRule(rule, signals({ createdAt: new Date('2026-05-10T00:00:00Z') }))).toBe(true);
    expect(evaluateRule(rule, signals({ createdAt: new Date('2026-05-17T23:59:59Z') }))).toBe(true);
    expect(evaluateRule(rule, signals({ createdAt: new Date('2026-06-01T00:00:00Z') }))).toBe(false);
    expect(evaluateRule(rule, signals({ createdAt: null }))).toBe(false);
  });

  it('defensively rejects an unknown signal or wrong-kind operator', () => {
    expect(evaluateRule({ all: [{ signal: 'nope', op: '>=', value: 1 }] }, signals())).toBe(false);
    // date op on a numeric signal
    expect(
      evaluateRule({ all: [{ signal: 'experience', op: 'before', value: 'x' }] }, signals({ experience: 99 })),
    ).toBe(false);
  });
});

describe('badgeRuleSchema', () => {
  it('accepts a valid rule', () => {
    expect(() => parseBadgeRule({ all: [{ signal: 'experience', op: '>=', value: 50 }] })).not.toThrow();
  });

  it('rejects an empty condition list', () => {
    expect(badgeRuleSchema.safeParse({ all: [] }).success).toBe(false);
  });

  it('rejects an unknown signal', () => {
    expect(badgeRuleSchema.safeParse({ all: [{ signal: 'mana', op: '>=', value: 1 }] }).success).toBe(false);
  });

  it('rejects an operator that does not match the signal kind', () => {
    // numeric signal with a date operator
    expect(
      badgeRuleSchema.safeParse({ all: [{ signal: 'experience', op: 'before', value: '2026-01-01' }] }).success,
    ).toBe(false);
    // date signal with a numeric value
    expect(
      badgeRuleSchema.safeParse({ all: [{ signal: 'createdAt', op: 'before', value: 5 }] }).success,
    ).toBe(false);
  });
});

describe('opsForKind', () => {
  it('exposes date vs numeric operators', () => {
    expect(opsForKind('date')).toEqual(['before', 'after']);
    expect(opsForKind('number')).toContain('>=');
  });
});

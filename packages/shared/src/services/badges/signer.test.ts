import { describe, expect, it } from 'vitest';

import { BADGE_SYMBOL_MAX_LEN, toBadgeSymbol } from './signer';

describe('toBadgeSymbol', () => {
  it('maps kebab-case keys to underscore symbols', () => {
    expect(toBadgeSymbol('first-deposit')).toBe('first_deposit');
    expect(toBadgeSymbol('week-warrior')).toBe('week_warrior');
    expect(toBadgeSymbol('third-place')).toBe('third_place');
  });

  it('passes already-valid symbols through unchanged', () => {
    expect(toBadgeSymbol('rookie')).toBe('rookie');
    expect(toBadgeSymbol('summer_2026')).toBe('summer_2026');
    expect(toBadgeSymbol('whale')).toBe('whale');
  });

  it('is injective over kebab keys — distinct badges never collide', () => {
    // The whole point of the fix: two different badges must map to two different
    // on-chain claim slots. Kebab keys contain no `_`, so `-`→`_` is a bijection.
    const keys = ['first-deposit', 'first-friend', 'week-warrior', 'third-place', 'second-deposit'];
    const symbols = keys.map(toBadgeSymbol);
    expect(new Set(symbols).size).toBe(keys.length);
  });

  it('rejects keys that cannot form a valid Soroban Symbol', () => {
    expect(() => toBadgeSymbol('bad key')).toThrow(); // space
    expect(() => toBadgeSymbol('emoji-🚀')).toThrow(); // non-ascii
    expect(() => toBadgeSymbol('a'.repeat(BADGE_SYMBOL_MAX_LEN + 1))).toThrow(); // too long
  });

  it('accepts a key exactly at the length limit', () => {
    const key = 'a'.repeat(BADGE_SYMBOL_MAX_LEN);
    expect(toBadgeSymbol(key)).toBe(key);
  });
});

import { describe, expect, it } from 'vitest';

import { Achievement } from '../../types';
import { BADGE_CATALOG } from './metadata';
import { toBadgeSymbol } from './signer';

// A badge key is not just an id: it indexes the i18n dictionary
// (`achievements.items.<key>`), it is stored verbatim in
// `badge_claims.badge_type`, and it derives the on-chain Soroban Symbol. The
// database spells keys with underscores, so a literal written with a hyphen
// misses every one of those lookups without raising anything.

const UNDERSCORE_ONLY = /^[a-z0-9]+(_[a-z0-9]+)*$/;

describe('Achievement keys', () => {
  it('spells every key with underscores, matching the database', () => {
    const offenders = Object.entries(Achievement).filter(([, key]) => !UNDERSCORE_ONLY.test(key));
    expect(offenders).toEqual([]);
  });

  it('has no duplicate values', () => {
    const values = Object.values(Achievement);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('BADGE_CATALOG', () => {
  // The catalog is keyed by the badge type read back off the contract. Soroban
  // Symbols allow only [a-zA-Z0-9_], so a hyphenated key is one the chain can
  // never hand us — the entry is dead and getBadgeMetadata returns null for
  // that badge.
  it('keys itself the way the chain spells badge types', () => {
    const unreachable = Object.keys(BADGE_CATALOG).filter((key) => toBadgeSymbol(key) !== key);
    expect(unreachable).toEqual([]);
  });

  it('gives every entry the fields the metadata response needs', () => {
    for (const [key, meta] of Object.entries(BADGE_CATALOG)) {
      expect(meta.name, key).toBeTruthy();
      expect(meta.description, key).toBeTruthy();
      expect(meta.imageFile, key).toMatch(/\.(png|jpg|webp)$/);
      expect(['A', 'B', 'C', 'D'], key).toContain(meta.category);
    }
  });

  it('covers the podium badges, whose keys the eligibility check compares against', () => {
    for (const key of [Achievement.FIRST_PLACE, Achievement.SECOND_PLACE, Achievement.THIRD_PLACE]) {
      expect(BADGE_CATALOG[key], key).toBeDefined();
    }
  });
});

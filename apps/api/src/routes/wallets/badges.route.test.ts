import { Achievement } from '@vaquita/shared';
import { describe, expect, it } from 'vitest';

import { medalEligible } from './badges.route';

// The podium badges are the only ones whose eligibility is decided by comparing
// the achievement key against a literal. Every other badge goes through the
// rule engine, which keys off the numeric id and cannot drift. So this is the
// one place where a misspelled key turns into "the medal never becomes
// claimable" — and, because the voucher endpoint re-checks it, into a claim
// rejected with NO_LONGER_ELIGIBLE even if the button somehow appeared.

describe('medalEligible', () => {
  it('awards gold only to rank 1', () => {
    expect(medalEligible(Achievement.FIRST_PLACE, 1)).toBe(true);
    expect(medalEligible(Achievement.FIRST_PLACE, 2)).toBe(false);
  });

  it('awards silver only to rank 2', () => {
    expect(medalEligible(Achievement.SECOND_PLACE, 2)).toBe(true);
    expect(medalEligible(Achievement.SECOND_PLACE, 1)).toBe(false);
    expect(medalEligible(Achievement.SECOND_PLACE, 3)).toBe(false);
  });

  it('awards bronze across the 3–10 band, inclusive', () => {
    expect(medalEligible(Achievement.THIRD_PLACE, 2)).toBe(false);
    expect(medalEligible(Achievement.THIRD_PLACE, 3)).toBe(true);
    expect(medalEligible(Achievement.THIRD_PLACE, 10)).toBe(true);
    expect(medalEligible(Achievement.THIRD_PLACE, 11)).toBe(false);
  });

  it('denies every podium badge to an unranked wallet', () => {
    for (const key of [Achievement.FIRST_PLACE, Achievement.SECOND_PLACE, Achievement.THIRD_PLACE]) {
      expect(medalEligible(key, null), key).toBe(false);
    }
  });

  it('denies badges that are not podium badges', () => {
    expect(medalEligible(Achievement.ROOKIE, 1)).toBe(false);
    expect(medalEligible(Achievement.TRIO_SAVER, 1)).toBe(false);
  });

  // The literals inside medalEligible are hand-written; the enum is what the
  // rest of the app passes in. If the two ever disagree, no rank qualifies.
  it('recognises the podium keys the shared enum actually carries', () => {
    const unrecognised = [Achievement.FIRST_PLACE, Achievement.SECOND_PLACE, Achievement.THIRD_PLACE].filter(
      (key) => ![1, 2, 3].some((rank) => medalEligible(key, rank)),
    );
    expect(unrecognised, 'podium keys no rank can satisfy').toEqual([]);
  });
});

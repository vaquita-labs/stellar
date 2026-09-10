import { describe, expect, it } from 'vitest';
import { depositCoinsFor, MIN_DEPOSIT_FOR_COINS_USDC, startOfUtcDay } from './depositCoins';

const CAP = 100;

describe('depositCoinsFor', () => {
  it('pays one coin per whole USDC, floored', () => {
    // The real production distribution: median, 75th, 90th percentile.
    expect(depositCoinsFor(1.1, CAP, 0)).toBe(1);
    expect(depositCoinsFor(8.11, CAP, 0)).toBe(8);
    expect(depositCoinsFor(66, CAP, 0)).toBe(66);
  });

  it('pays nothing below the minimum', () => {
    expect(depositCoinsFor(0.99, CAP, 0)).toBe(0);
    expect(depositCoinsFor(0, CAP, 0)).toBe(0);
    expect(depositCoinsFor(MIN_DEPOSIT_FOR_COINS_USDC, CAP, 0)).toBe(1);
  });

  it('caps a single large deposit', () => {
    // The largest deposit ever made would otherwise out-pay a Diamond badge.
    expect(depositCoinsFor(250, CAP, 0)).toBe(CAP);
    expect(depositCoinsFor(10_000, CAP, 0)).toBe(CAP);
  });

  it('pays only the day\'s remainder on a second deposit', () => {
    expect(depositCoinsFor(50, CAP, 60)).toBe(40);
    expect(depositCoinsFor(50, CAP, 100)).toBe(0);
    // Already over the cap somehow (a cap lowered mid-day): still nothing owed.
    expect(depositCoinsFor(50, CAP, 140)).toBe(0);
  });

  it('honours a cap the admin changed', () => {
    expect(depositCoinsFor(500, 250, 0)).toBe(250);
    expect(depositCoinsFor(500, 0, 0)).toBe(0);
  });

  it('pays nothing for an amount that is not a number', () => {
    expect(depositCoinsFor(Number.NaN, CAP, 0)).toBe(0);
    expect(depositCoinsFor(Number.POSITIVE_INFINITY, CAP, 0)).toBe(0);
  });
});

describe('startOfUtcDay', () => {
  it('cuts the window at midnight UTC, not the server\'s local midnight', () => {
    // 22:30 in Bolivia is already the next UTC day; the window has to follow UTC
    // or the cap resets at a different hour depending on where the API runs.
    expect(startOfUtcDay(new Date('2026-09-10T02:30:00.000Z')).toISOString()).toBe('2026-09-10T00:00:00.000Z');
    expect(startOfUtcDay(new Date('2026-09-10T23:59:59.999Z')).toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });
});

import { describe, expect, it } from 'vitest';

import { accrueVaultUsdcHours } from './onchainBalances';
import { depositExperience, vaultExperience } from '../profile';

/**
 * The vault XP accumulator.
 *
 * `wallet_balances` holds a single mutable balance with no deposit event, so
 * there is no start time to measure from the way `depositExperience` does. The
 * integration happens at observation time instead: every successful read credits
 * `min(previous, current) x hours elapsed` into `vault_usdc_hours`, and XP is
 * the square root of that running total.
 *
 * These tests pin the four properties that design rests on. Break any of them
 * and vault XP stops being comparable to locked-pool XP.
 */

const HOUR = 3_600_000;
const t = (hours: number) => new Date(hours * HOUR);

/** Replays a series of observations through the fold, as the scraper would. */
function replay(observations: { balance: number; atHours: number }[]): number {
  let usdcHours = 0;
  let priorBalance = 0;
  let priorObservedAt: Date | null = null;

  for (const observation of observations) {
    usdcHours = accrueVaultUsdcHours({
      priorUsdcHours: usdcHours,
      priorVaultUsdc: priorBalance,
      priorObservedAt,
      vaultUsdc: observation.balance,
      observedAt: t(observation.atHours),
    });
    priorBalance = observation.balance;
    priorObservedAt = t(observation.atHours);
  }
  return usdcHours;
}

describe('accrueVaultUsdcHours', () => {
  it('credits nothing on the first observation — it only sets the baseline', () => {
    expect(
      accrueVaultUsdcHours({
        priorUsdcHours: 0,
        priorVaultUsdc: 0,
        priorObservedAt: null,
        vaultUsdc: 1000,
        observedAt: t(0),
      }),
    ).toBe(0);
  });

  it('is the same scale as depositExperience for a balance held constant', () => {
    // 1000 USDC sitting in the vault from hour 0 to hour 100.
    const usdcHours = replay([
      { balance: 1000, atHours: 0 },
      { balance: 1000, atHours: 100 },
    ]);

    // The equivalence the whole design rests on: sqrt(A*T) === sqrt(A)*sqrt(T).
    expect(vaultExperience(usdcHours)).toBeCloseTo(
      depositExperience(1000, 0, 100 * HOUR),
      9,
    );
  });

  it('does not depend on how often the balance is observed', () => {
    const once = replay([
      { balance: 500, atHours: 0 },
      { balance: 500, atHours: 24 },
    ]);
    const hourly = replay(
      Array.from({ length: 25 }, (_, i) => ({ balance: 500, atHours: i })),
    );

    // A user who opens the app every hour must not out-earn one who opens it
    // once a day for the same money. Otherwise XP rewards app-opening.
    expect(hourly).toBeCloseTo(once, 9);
  });

  it('never decreases, even when the balance goes to zero', () => {
    const held = replay([
      { balance: 1000, atHours: 0 },
      { balance: 1000, atHours: 50 },
    ]);
    const withdrawn = replay([
      { balance: 1000, atHours: 0 },
      { balance: 1000, atHours: 50 },
      { balance: 0, atHours: 60 },
      { balance: 0, atHours: 200 },
    ]);

    // Withdrawing stops accrual; it does not take earned XP away.
    expect(withdrawn).toBeGreaterThanOrEqual(held);
    expect(vaultExperience(withdrawn)).toBeGreaterThanOrEqual(vaultExperience(held));
  });

  it('credits the minimum of the endpoints, so a late deposit cannot back-date itself', () => {
    // Empty for 100 hours, then 1000 USDC arrives just before the read.
    const gamed = replay([
      { balance: 0, atHours: 0 },
      { balance: 1000, atHours: 100 },
    ]);

    expect(gamed).toBe(0);
  });

  it('undercredits rather than overcredits when the balance moves', () => {
    const rising = replay([
      { balance: 100, atHours: 0 },
      { balance: 1000, atHours: 10 },
    ]);

    // min(100, 1000) * 10 — the conservative endpoint, never the generous one.
    expect(rising).toBe(1000);
  });

  it('credits the whole gap after a failed read, at the min of its endpoints', () => {
    // A failed read leaves the accumulator and observed_at untouched, so the
    // next success integrates across the entire outage rather than losing it.
    const withGap = replay([
      { balance: 800, atHours: 0 },
      { balance: 800, atHours: 30 },
    ]);
    const uninterrupted = replay([
      { balance: 800, atHours: 0 },
      { balance: 800, atHours: 10 },
      { balance: 800, atHours: 20 },
      { balance: 800, atHours: 30 },
    ]);

    expect(withGap).toBeCloseTo(uninterrupted, 9);
  });

  it('ignores a clock that went backwards and two reads in the same instant', () => {
    const prior = { priorUsdcHours: 500, priorVaultUsdc: 100, priorObservedAt: t(10) };

    expect(accrueVaultUsdcHours({ ...prior, vaultUsdc: 100, observedAt: t(10) })).toBe(500);
    expect(accrueVaultUsdcHours({ ...prior, vaultUsdc: 100, observedAt: t(5) })).toBe(500);
  });

  it('treats a negative balance as zero rather than draining the accumulator', () => {
    expect(
      accrueVaultUsdcHours({
        priorUsdcHours: 500,
        priorVaultUsdc: -100,
        priorObservedAt: t(0),
        vaultUsdc: 100,
        observedAt: t(10),
      }),
    ).toBe(500);
  });
});

describe('vaultExperience', () => {
  it('is zero for a wallet that has never held a vault balance', () => {
    expect(vaultExperience(0)).toBe(0);
  });

  it('floors at zero rather than returning NaN', () => {
    expect(vaultExperience(-1)).toBe(0);
    expect(vaultExperience(Number.NaN)).toBe(0);
  });
});

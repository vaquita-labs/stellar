import { describe, expect, it } from 'vitest';
import { estimateRewardShare } from './rewards';

describe('estimateRewardShare', () => {
  it('reproduces the contract split asserted in pool_coverage.rs', () => {
    // `on_time_withdraw_includes_reward_share`: alice 100k, bob 300k, pozo 40k.
    // El contrato le paga 1/4 a alice y 3/4 a bob.
    const pool = 40_000;
    const tvl = 100_000 + 300_000;
    expect(estimateRewardShare(pool, tvl, 100_000)).toBe(pool / 4);
    expect(estimateRewardShare(pool, tvl, 300_000)).toBe((pool * 3) / 4);
  });

  it('reconciles the reported incident: $32 of a $183 pool with $4 in it pays ~$0.70', () => {
    expect(estimateRewardShare(4, 183, 32)).toBeCloseTo(0.7, 2);
  });

  it('returns zero when the period has no deposits, like calculate_reward does', () => {
    // types.rs `Period { reward_pool: 1_000, total_deposits: 0 }` → 0.
    expect(estimateRewardShare(1_000, 0, 500)).toBe(0);
  });

  it('returns zero instead of NaN for the values the API serves before it loads', () => {
    expect(estimateRewardShare(0, 0, 0)).toBe(0);
    expect(estimateRewardShare(4, 183, 0)).toBe(0);
    expect(estimateRewardShare(Number.NaN, 183, 32)).toBe(0);
    expect(estimateRewardShare(4, Number.POSITIVE_INFINITY, 32)).toBe(0);
  });

  it('never hands back more than the whole pool', () => {
    // El monto entero del plazo: se lleva todo el pozo, no más.
    expect(estimateRewardShare(4, 183, 183)).toBe(4);
  });
});

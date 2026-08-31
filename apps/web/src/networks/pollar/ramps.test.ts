import { describe, expect, it } from 'vitest';
import { usdcCostOf } from './ramps';

describe('usdcCostOf', () => {
  // Regresión del off-ramp BOB del 2026-08-31: la wallet se fondeó con la
  // división exacta (1.7901542 / 1.8773182) pero Pollar cobró el centavo
  // redondeado hacia arriba (1.80 / 1.88) y ambos pagos fallaron en el ledger
  // con PAYMENT_UNDERFUNDED.
  it('rounds the cost UP to the whole cent the provider actually charges', () => {
    expect(usdcCostOf(1.7901542, { rate: 1 })).toBe(1.8);
    expect(usdcCostOf(1.8773182, { rate: 1 })).toBe(1.88);
  });

  it('does not inflate a cost that is already an exact cent', () => {
    // 1.1 * 100 da 110.00000000000001 en coma flotante: sin aplanar el ruido,
    // el ceil lo subiría un centavo de más.
    expect(usdcCostOf(1.1, { rate: 1 })).toBe(1.1);
    expect(usdcCostOf(1.8, { rate: 1 })).toBe(1.8);
    expect(usdcCostOf(110, { rate: 100 })).toBe(1.1);
  });

  it('divides by the quoted rate (fiat per 1 USDC) before ceiling', () => {
    // 12.44 BOB a 6.95 BOB/USDC = 1.78992... → 1.79
    expect(usdcCostOf(12.44, { rate: 6.95 })).toBe(1.79);
  });

  it('returns null when the rate or the resulting cost is unusable', () => {
    expect(usdcCostOf(10, { rate: 0 })).toBeNull();
    expect(usdcCostOf(10, { rate: -1 })).toBeNull();
    expect(usdcCostOf(10, { rate: Number.NaN })).toBeNull();
    expect(usdcCostOf(0, { rate: 6.95 })).toBeNull();
    expect(usdcCostOf(-5, { rate: 6.95 })).toBeNull();
  });
});

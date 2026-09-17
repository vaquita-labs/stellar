/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  return {
    ISSUER,
    OTHER_ISSUER: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    balance: { current: { step: 'idle' } as Record<string, unknown> },
    blend: { current: { usdcIssuer: ISSUER } as { usdcIssuer: string } | null },
  };
});

vi.mock('@pollar/react', () => ({ usePollar: () => ({ walletBalance: h.balance.current }) }));
vi.mock('@/networks/stellar/blendDirect', () => ({ blendConfigForToken: () => h.blend.current }));
vi.mock('../stores', () => ({
  useConfigStore: (selector: (state: unknown) => unknown) => selector({ token: { code: 'USDC', decimals: 7 } }),
}));

import { useWalletUsdc } from './useWalletUsdc';

/** A `loaded` step carrying one USDC balance for `issuer`. */
const loaded = (available: string, issuer = h.ISSUER) => ({
  step: 'loaded',
  data: { balances: [{ code: 'USDC', issuer, available }] },
});

beforeEach(() => {
  h.balance.current = { step: 'idle' };
  h.blend.current = { usdcIssuer: h.ISSUER };
});

describe('useWalletUsdc', () => {
  it('knows nothing before the first read', () => {
    expect(renderHook(() => useWalletUsdc()).result.current).toBeNull();
  });

  it('reads the balance of the USDC Blend accepts', () => {
    h.balance.current = loaded('2.0000001');
    expect(renderHook(() => useWalletUsdc()).result.current).toBe(2.0000001);
  });

  it('reads zero when the wallet holds no USDC at all', () => {
    h.balance.current = { step: 'loaded', data: { balances: [] } };
    expect(renderHook(() => useWalletUsdc()).result.current).toBe(0);
  });

  it('does not count a USDC from another issuer', () => {
    h.balance.current = loaded('99', h.OTHER_ISSUER);
    expect(renderHook(() => useWalletUsdc()).result.current).toBe(0);
  });

  it('knows nothing when the token has no Blend pool', () => {
    h.blend.current = null;
    h.balance.current = loaded('2');
    expect(renderHook(() => useWalletUsdc()).result.current).toBeNull();
  });

  // The whole point of the memory: Pollar drops its data on every re-read, and
  // a caller that takes the gap for zero watches the money leave and come back.
  it('holds the figure while Pollar re-reads it', () => {
    h.balance.current = loaded('2');
    const { result, rerender } = renderHook(() => useWalletUsdc());
    expect(result.current).toBe(2);

    h.balance.current = { step: 'loading' };
    rerender();

    expect(result.current).toBe(2);
  });

  it('holds the figure when the re-read fails', () => {
    h.balance.current = loaded('2');
    const { result, rerender } = renderHook(() => useWalletUsdc());

    h.balance.current = { step: 'error', message: 'Failed to load balance' };
    rerender();

    expect(result.current).toBe(2);
  });

  it('never reports anything but the real figure across a whole refresh', () => {
    h.balance.current = loaded('2');
    const seen: (number | null)[] = [];
    const { rerender } = renderHook(() => {
      const value = useWalletUsdc();
      seen.push(value);
      return value;
    });

    h.balance.current = { step: 'loading' };
    rerender();
    h.balance.current = loaded('2');
    rerender();

    expect(new Set(seen)).toEqual(new Set([2]));
  });

  it('publishes the new figure once a fresh read lands', () => {
    h.balance.current = loaded('2');
    const { result, rerender } = renderHook(() => useWalletUsdc());

    h.balance.current = { step: 'loading' };
    rerender();
    h.balance.current = loaded('7.5');
    rerender();

    expect(result.current).toBe(7.5);
  });

  it('follows the balance down when the user spends it', () => {
    h.balance.current = loaded('2');
    const { result, rerender } = renderHook(() => useWalletUsdc());

    h.balance.current = loaded('0');
    rerender();

    expect(result.current).toBe(0);
  });

  // Nothing is known yet, so there is nothing to hold on to: the first reading
  // has to arrive as a reading, not as a rise from a made-up zero.
  it('still knows nothing when the very first read fails', () => {
    h.balance.current = { step: 'error', message: 'No wallet connected' };
    expect(renderHook(() => useWalletUsdc()).result.current).toBeNull();
  });
});

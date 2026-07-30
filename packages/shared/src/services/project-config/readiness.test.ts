import type { Token } from '@vaquita/db';
import { describe, expect, it } from 'vitest';
import { isTokenUsable, tokenReadiness } from './readiness';

// A fully configured mainnet USDC row, the shape the app can serve end to end.
const makeToken = (overrides: Partial<Token> = {}): Token =>
  ({
    id: 2,
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 7,
    isNative: false,
    isGas: false,
    isSupported: true,
    contractAddress: 'CCW67TSZ',
    vaquitaContractAddress: 'CDTTAZ3N',
    lockPeriods: [2592000000n],
    defindexVaultContractAddress: 'CBM3VVKT',
    issuer: 'GA5ZSEJY',
    blendPoolContractAddress: 'CAJJZSGM',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
    ...overrides,
  }) as Token;

describe('tokenReadiness', () => {
  it('publishes a fully configured token', () => {
    expect(tokenReadiness(makeToken())).toEqual({ usable: true, gaps: [] });
  });

  it.each([
    ['contractAddress', { contractAddress: null }],
    ['issuer', { issuer: null }],
    ['vaquitaContractAddress', { vaquitaContractAddress: null }],
    ['defindexVaultContractAddress', { defindexVaultContractAddress: null }],
    ['blendPoolContractAddress', { blendPoolContractAddress: null }],
  ])('withholds a token missing %s, and names it', (field, overrides) => {
    const result = tokenReadiness(makeToken(overrides as Partial<Token>));
    expect(result.usable).toBe(false);
    expect(result.gaps.map((g) => g.field)).toEqual([field]);
    expect(result.gaps[0]?.reason).not.toHaveLength(0);
  });

  // The case that motivated the check: a vault configured without the Blend pool
  // the passive balance and wallet reads still resolve through.
  it('withholds a token that has a vault but no Blend pool', () => {
    const result = tokenReadiness(makeToken({ blendPoolContractAddress: null }));
    expect(result.usable).toBe(false);
    expect(result.gaps.map((g) => g.label)).toContain('Blend pool');
  });

  // Decimals arrive as 0 when unset, and every amount scales by 10 ** decimals.
  it('treats zero decimals as missing', () => {
    expect(tokenReadiness(makeToken({ decimals: 0 })).usable).toBe(false);
  });

  it('withholds a token flagged unsupported', () => {
    expect(tokenReadiness(makeToken({ isSupported: false })).usable).toBe(false);
  });

  it('reports every gap at once, not just the first', () => {
    const result = tokenReadiness(makeToken({ issuer: null, blendPoolContractAddress: null }));
    expect(result.gaps.map((g) => g.field)).toEqual(['issuer', 'blendPoolContractAddress']);
  });
});

describe('isTokenUsable', () => {
  it('agrees with tokenReadiness', () => {
    expect(isTokenUsable(makeToken())).toBe(true);
    expect(isTokenUsable(makeToken({ contractAddress: null }))).toBe(false);
  });
});

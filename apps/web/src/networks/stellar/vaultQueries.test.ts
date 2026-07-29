import { describe, expect, it } from 'vitest';
import type { NetworkResponseDTO } from '@/core-ui/types';
import { defindexVaultConfigForToken, rawToUsdc } from './vaultQueries';

type Token = NetworkResponseDTO['tokens'][number];

const makeToken = (overrides: Partial<Token> = {}): Token => ({
  isGas: false,
  isNative: false,
  isSupported: true,
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 7,
  lockPeriods: [],
  contractAddress: 'CUSDC',
  vaquitaContractAddress: 'CPOOL',
  issuer: 'GISSUER',
  blendPoolContractAddress: 'CBLEND',
  defindexVaultContractAddress: 'CVAULT',
  ...overrides,
});

describe('defindexVaultConfigForToken', () => {
  it('resolves the vault, USDC and decimals from the token', () => {
    expect(defindexVaultConfigForToken(makeToken())).toEqual({
      vaultId: 'CVAULT',
      usdcId: 'CUSDC',
      decimals: 7,
    });
  });

  it('returns null when the token has no DeFindex vault configured', () => {
    expect(defindexVaultConfigForToken(makeToken({ defindexVaultContractAddress: null }))).toBeNull();
  });

  it('returns null when there is no token', () => {
    expect(defindexVaultConfigForToken(null)).toBeNull();
  });
});

describe('rawToUsdc', () => {
  it('converts a raw i128 amount to human USDC using the token decimals', () => {
    // 34.9500765 USDC at 7 decimals — the exact prod reconciliation figure.
    expect(rawToUsdc(349500765n, 7)).toBe(34.9500765);
  });

  it('maps one whole unit correctly', () => {
    expect(rawToUsdc(10000000n, 7)).toBe(1);
  });

  it('treats zero as zero', () => {
    expect(rawToUsdc(0n, 7)).toBe(0);
  });
});

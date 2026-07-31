import { describe, expect, it } from 'vitest';
import type { NetworkResponseDTO } from '@/core-ui/types';
import { toBaseUnits } from './sorobanTx';
import {
  applySlippageFloor,
  defindexVaultConfigForToken,
  formatBaseUnits,
  parseVaultErrorMessage,
  rawToUsdc,
  usdcToShares,
  WITHDRAW_SLIPPAGE_BPS,
} from './vaultQueries';

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

  // A token row with no decimals reaches the client as 0; every amount here is
  // scaled by 10 ** decimals, so treating that as valid would misread balances.
  it('returns null when the token carries no decimals', () => {
    expect(defindexVaultConfigForToken(makeToken({ decimals: 0 }))).toBeNull();
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

describe('usdcToShares', () => {
  it('mirrors the amount while one share is worth one unit', () => {
    expect(usdcToShares(349500765n, 1_000_000n, 1_000_000n)).toBe(349500765n);
  });

  it('asks for fewer shares once the vault has appreciated', () => {
    // 200 managed behind 100 shares: each share is worth two units.
    expect(usdcToShares(100n, 100n, 200n)).toBe(50n);
  });

  it('floors so it never rounds up past what the user holds', () => {
    // 10 * 3 / 7 = 4.28… → 4
    expect(usdcToShares(10n, 3n, 7n)).toBe(4n);
  });

  it('returns zero shares for an empty vault instead of dividing by zero', () => {
    expect(usdcToShares(349500765n, 1_000_000n, 0n)).toBe(0n);
  });
});

describe('applySlippageFloor', () => {
  it('keeps the withdraw margin at 0.5%', () => {
    expect(WITHDRAW_SLIPPAGE_BPS).toBe(50);
  });

  it('floors one whole USDC by the withdraw margin', () => {
    expect(applySlippageFloor(10_000_000n, WITHDRAW_SLIPPAGE_BPS)).toBe(9_950_000n);
  });

  it('leaves the amount untouched at zero basis points', () => {
    expect(applySlippageFloor(349500765n, 0)).toBe(349500765n);
  });

  it('truncates rather than rounding up', () => {
    // 3 * 9950 / 10000 = 2.985 → 2
    expect(applySlippageFloor(3n, WITHDRAW_SLIPPAGE_BPS)).toBe(2n);
  });
});

describe('parseVaultErrorMessage', () => {
  it('translates a recognized vault contract error', () => {
    expect(parseVaultErrorMessage(new Error('HostError: Error(Contract, #412)'))).toBe('Not enough balance');
  });

  it('reads the code out of a plain string too', () => {
    expect(parseVaultErrorMessage('Error(Contract, #451)')).toBe('Amount is too small');
  });

  it('returns null for a contract error the UI does not map', () => {
    expect(parseVaultErrorMessage('Error(Contract, #999)')).toBeNull();
  });

  it('returns null when the failure is not a contract error', () => {
    expect(parseVaultErrorMessage(new Error('network timeout'))).toBeNull();
  });
});

describe('formatBaseUnits', () => {
  it('renders a raw amount with the token decimals', () => {
    expect(formatBaseUnits(2_830_008_070n, 7)).toBe('283.0008070');
    expect(formatBaseUnits(1n, 7)).toBe('0.0000001');
    expect(formatBaseUnits(0n, 7)).toBe('0.0000000');
  });

  it('pads amounts smaller than one whole unit', () => {
    expect(formatBaseUnits(500n, 7)).toBe('0.0000500');
  });

  it('renders a negative amount', () => {
    expect(formatBaseUnits(-2_830_008_070n, 7)).toBe('-283.0008070');
  });

  it('renders an integer token as-is', () => {
    expect(formatBaseUnits(42n, 0)).toBe('42');
  });

  it('round-trips through toBaseUnits without losing a base unit', () => {
    // The migration and withdraw flows hand this string straight to a deposit, so
    // the value that comes back out has to be the exact delta that was measured.
    for (const raw of [1n, 999n, 10_000_000n, 2_830_008_070n, 99_999_999_999n]) {
      expect(toBaseUnits(formatBaseUnits(raw, 7), 7)).toBe(raw);
    }
  });
});

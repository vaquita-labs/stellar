import { describe, expect, it } from 'vitest';
import { assetCode } from './strings';

describe('assetCode', () => {
  it('keeps only the code of a CODE:ISSUER asset', () => {
    expect(assetCode('USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN')).toBe('USDC');
  });
  it('leaves a bare code as it is', () => {
    expect(assetCode('USDC')).toBe('USDC');
  });
  it('names the native coin', () => {
    expect(assetCode('native')).toBe('XLM');
  });
});

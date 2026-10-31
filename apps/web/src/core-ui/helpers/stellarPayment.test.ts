import { describe, expect, it } from 'vitest';
import { buildPaymentQr, parseStellarPayment } from './stellarPayment';

const ADDR = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('parseStellarPayment', () => {
  it('reads a bare address, whatever the case or spacing', () => {
    expect(parseStellarPayment(`  ${ADDR.toLowerCase()} `)).toEqual({ destination: ADDR });
  });

  it('reads a SEP-7 pay link with amount and memo', () => {
    const payload = `web+stellar:pay?destination=${ADDR}&amount=12.5&memo=lunch`;
    expect(parseStellarPayment(payload)).toEqual({ destination: ADDR, amount: '12.5', memo: 'lunch' });
  });

  it('drops an amount that is not a positive number', () => {
    expect(parseStellarPayment(`web+stellar:pay?destination=${ADDR}&amount=abc`)).toEqual({ destination: ADDR });
    expect(parseStellarPayment(`web+stellar:pay?destination=${ADDR}&amount=0`)).toEqual({ destination: ADDR });
  });

  it('finds an address inside a link or a blob', () => {
    expect(parseStellarPayment(`https://vaquita.fi/u?wallet=${ADDR}&x=1`)).toEqual({ destination: ADDR });
    expect(parseStellarPayment(`{"address":"${ADDR}"}`)).toEqual({ destination: ADDR });
  });

  it('rejects anything without a destination', () => {
    expect(parseStellarPayment('hello')).toBeNull();
    expect(parseStellarPayment('')).toBeNull();
    expect(parseStellarPayment('web+stellar:pay?destination=GNOPE')).toBeNull();
  });
});

describe('buildPaymentQr', () => {
  it('is the bare address without an amount', () => {
    expect(buildPaymentQr(ADDR)).toBe(ADDR);
    expect(buildPaymentQr(ADDR, { amount: '' })).toBe(ADDR);
    expect(buildPaymentQr(ADDR, { amount: '0' })).toBe(ADDR);
  });

  it('is a SEP-7 link with the asset once an amount is set, and parses back', () => {
    const qr = buildPaymentQr(ADDR, { amount: '3.25', assetCode: 'USDC', assetIssuer: ISSUER });
    expect(qr.startsWith('web+stellar:pay?')).toBe(true);
    expect(qr).toContain('asset_code=USDC');
    expect(qr).toContain(`asset_issuer=${ISSUER}`);
    expect(parseStellarPayment(qr)).toEqual({ destination: ADDR, amount: '3.25' });
  });
});

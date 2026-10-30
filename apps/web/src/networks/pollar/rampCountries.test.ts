import type { RampRoute } from '@pollar/core';
import { describe, expect, it } from 'vitest';
import { rampCountryCodes } from './rampCountries';

/** A real route carries more fields; only the fiat side matters here. */
const route = (country: string, currency: string) =>
  ({ fiat: { country, currency, rail: 'QR' }, asset: {}, legs: [] }) as unknown as RampRoute;

describe('rampCountryCodes', () => {
  it('keeps the countries the routes reach, so a listed corridor can open', () => {
    expect(rampCountryCodes([route('BO', 'BOB'), route('BR', 'BRL')])).toEqual(['BO', 'BR']);
  });

  it('matches a code the provider wrote in lowercase', () => {
    // The picker compares against upper-case 'BO': without normalizing, a 'bo'
    // from the provider would switch off a corridor that is enabled.
    expect(rampCountryCodes([route(' bo ', 'BOB')])).toEqual(['BO']);
  });

  it('yields nothing when there is no route at all', () => {
    // Testnet, where the corridor does not exist. Empty means everything off.
    expect(rampCountryCodes([])).toEqual([]);
  });

  it('yields nothing when there was no response to read', () => {
    expect(rampCountryCodes(undefined)).toEqual([]);
    expect(rampCountryCodes(null)).toEqual([]);
  });

  it('drops routes with no usable country instead of enabling an empty one', () => {
    expect(rampCountryCodes([route('', 'BOB'), route('   ', 'BOB')])).toEqual([]);
  });

  it('lists a country once even if several routes reach it', () => {
    expect(rampCountryCodes([route('BO', 'BOB'), route('bo', 'BOB')])).toEqual(['BO']);
  });
});

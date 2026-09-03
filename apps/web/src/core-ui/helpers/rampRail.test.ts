import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { railLabel } from './rampRail';

/** Devuelve el fallback, que es lo que rinde i18next con la clave sin traducir. */
const t = ((_key: string, fallback?: string) => fallback ?? '') as unknown as TFunction;

describe('railLabel', () => {
  it('reads ACH as a bank transfer, which is what the user sees on their side', () => {
    expect(railLabel('ACH', t)).toBe('Bank Transfer');
  });

  it('matches however the provider writes it', () => {
    expect(railLabel('ach', t)).toBe('Bank Transfer');
    expect(railLabel(' Ach ', t)).toBe('Bank Transfer');
  });

  it('leaves a rail people already know by name alone', () => {
    expect(railLabel('PIX', t)).toBe('PIX');
    expect(railLabel('BREB', t)).toBe('BREB');
  });

  it('renders nothing when there is no rail yet, instead of a dangling label', () => {
    expect(railLabel('', t)).toBe('');
    expect(railLabel(null, t)).toBe('');
    expect(railLabel(undefined, t)).toBe('');
  });
});

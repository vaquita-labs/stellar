import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { formatRampEta } from './time';

/**
 * The ETA is prose the ramp provider wrote, so these cases are shapes seen in
 * the wild rather than a contract the provider promises to keep.
 */
describe('formatRampEta', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('es');
  });

  it('reads the number and its unit, and says them in the reader language', () => {
    expect(formatRampEta('5 minutes')).toBe('5 minutos');
    expect(formatRampEta('1 hour')).toBe('1 hora');
    expect(formatRampEta('2 days')).toBe('2 días');
  });

  it('keeps the hedge the provider put on the number', () => {
    expect(formatRampEta('~5 minutes')).toBe('unos 5 minutos');
    expect(formatRampEta('approx. 30 minutes')).toBe('unos 30 minutos');
    expect(formatRampEta('about 1 hour')).toBe('cerca de 1 hora');
  });

  it('agrees with the gender of the unit, which a single wrapper phrase could not', () => {
    expect(formatRampEta('~2 hours')).toBe('unas 2 horas');
    expect(formatRampEta('~3 days')).toBe('unos 3 días');
  });

  it('collapses a range to its upper bound so the estimate stays one short phrase', () => {
    expect(formatRampEta('5-10 minutes')).toBe('hasta 10 minutos');
    expect(formatRampEta('1 to 2 hours')).toBe('hasta 2 horas');
  });

  it('still says something useful when the provider loses the number', () => {
    expect(formatRampEta('~minutes')).toBe('unos minutos');
    expect(formatRampEta('hours')).toBe('unas horas');
  });

  it('keeps the provider wording when the unit is unknown, rather than inventing a duration', () => {
    expect(formatRampEta('instant')).toBe('instant');
    expect(formatRampEta('same business day')).toBe('same business day');
  });

  it('renders nothing for an empty estimate, instead of a dangling label', () => {
    expect(formatRampEta('')).toBe('');
    expect(formatRampEta('   ')).toBe('');
  });

  it('follows the reader to another language', async () => {
    await i18n.changeLanguage('en');
    expect(formatRampEta('~minutes')).toBe('a few minutes');
    expect(formatRampEta('~5 minutes')).toBe('about 5 minutes');
    expect(formatRampEta('5-10 minutes')).toBe('up to 10 minutes');
    await i18n.changeLanguage('es');
  });
});

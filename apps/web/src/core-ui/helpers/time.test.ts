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

  it('drops the provider tilde, because the label already calls it an estimate', () => {
    expect(formatRampEta('~5 minutes')).toBe('5 minutos');
    expect(formatRampEta('approx. 30 minutes')).toBe('30 minutos');
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
    expect(formatRampEta('5-10 minutes')).toBe('up to 10 minutes');
    await i18n.changeLanguage('es');
  });
});

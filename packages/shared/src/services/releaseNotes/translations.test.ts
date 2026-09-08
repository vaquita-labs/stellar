import { describe, expect, it } from 'vitest';

import { parseReleaseNoteTranslations, resolveReleaseNoteText } from './index';

const note = { title: 'Puente USDC', body: 'Mové USDC entre Base y Stellar.' };

describe('parseReleaseNoteTranslations', () => {
  it('keeps a complete pair for a language we ship', () => {
    expect(parseReleaseNoteTranslations({ en: { title: 'Bridge', body: 'Move USDC.' } })).toEqual({
      en: { title: 'Bridge', body: 'Move USDC.' },
    });
  });

  it('trims the stored text', () => {
    expect(parseReleaseNoteTranslations({ pt: { title: '  Ponte  ', body: '  Mova USDC.  ' } })).toEqual({
      pt: { title: 'Ponte', body: 'Mova USDC.' },
    });
  });

  // Half a translation renders as an English headline over a Spanish paragraph.
  // Dropping it falls back to a note that at least reads consistently.
  it.each([
    ['a missing body', { en: { title: 'Bridge' } }],
    ['an empty body', { en: { title: 'Bridge', body: '' } }],
    ['a whitespace-only title', { en: { title: '   ', body: 'Move USDC.' } }],
    ['a non-string title', { en: { title: 42, body: 'Move USDC.' } }],
  ])('drops %s', (_label, input) => {
    expect(parseReleaseNoteTranslations(input)).toEqual({});
  });

  it('drops a language the app no longer ships', () => {
    expect(parseReleaseNoteTranslations({ fr: { title: 'Pont', body: 'Déplacez.' } })).toEqual({});
  });

  // Spanish is the base language: it lives in `title`/`body`, so an `es` key in
  // the overrides is a second copy that nothing would ever read.
  it('drops the base language', () => {
    expect(parseReleaseNoteTranslations({ es: { title: 'Puente', body: 'Mové USDC.' } })).toEqual({});
  });

  // Postgres only guarantees the column is an object; everything else is on us.
  it.each([
    ['null', null],
    ['an array', [{ title: 'x', body: 'y' }]],
    ['a string', 'en'],
    ['a nested array', { en: ['Bridge', 'Move USDC.'] }],
  ])('returns nothing for %s', (_label, input) => {
    expect(parseReleaseNoteTranslations(input)).toEqual({});
  });

  it('keeps the good language and drops the broken one', () => {
    const parsed = parseReleaseNoteTranslations({
      en: { title: 'Bridge', body: 'Move USDC.' },
      pt: { title: 'Ponte' },
    });
    expect(parsed).toEqual({ en: { title: 'Bridge', body: 'Move USDC.' } });
  });
});

describe('resolveReleaseNoteText', () => {
  const translated = { ...note, translations: { en: { title: 'Bridge USDC', body: 'Move USDC.' } } };

  it('returns the translation when there is one', () => {
    expect(resolveReleaseNoteText(translated, 'en')).toEqual({ title: 'Bridge USDC', body: 'Move USDC.' });
  });

  // The whole point of the design: publishing with one language written must
  // still show something to everyone else.
  it.each([
    ['a language with no translation', 'pt'],
    ['a language we do not ship', 'fr'],
    ['the base language itself', 'es'],
    ['no language at all', undefined],
    ['an empty string', ''],
  ])('falls back to the base text for %s', (_label, language) => {
    expect(resolveReleaseNoteText(translated, language)).toEqual(note);
  });

  // i18next hands over whatever the browser reports.
  it.each(['en-GB', 'en-US', 'EN', 'en-AU'])('matches the regional variant %s', (language) => {
    expect(resolveReleaseNoteText(translated, language).title).toBe('Bridge USDC');
  });

  it('falls back when the note carries no translations field at all', () => {
    expect(resolveReleaseNoteText(note, 'en')).toEqual(note);
  });
});

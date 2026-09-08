import { describe, expect, it } from 'vitest';

import { parseReleaseNoteTranslations, resolveReleaseNoteText } from './index';

const note = { title: 'Bridge USDC', body: 'Move USDC between Base and Stellar.' };

describe('parseReleaseNoteTranslations', () => {
  it('keeps a complete pair for a language we ship', () => {
    expect(parseReleaseNoteTranslations({ es: { title: 'Puente', body: 'Mové USDC.' } })).toEqual({
      es: { title: 'Puente', body: 'Mové USDC.' },
    });
  });

  it('trims the stored text', () => {
    expect(parseReleaseNoteTranslations({ pt: { title: '  Ponte  ', body: '  Mova USDC.  ' } })).toEqual({
      pt: { title: 'Ponte', body: 'Mova USDC.' },
    });
  });

  // Half a translation renders as a Spanish headline over an English paragraph.
  // Dropping it falls back to a note that at least reads consistently.
  it.each([
    ['a missing body', { es: { title: 'Puente' } }],
    ['an empty body', { es: { title: 'Puente', body: '' } }],
    ['a whitespace-only title', { es: { title: '   ', body: 'Mové USDC.' } }],
    ['a non-string title', { es: { title: 42, body: 'Mové USDC.' } }],
  ])('drops %s', (_label, input) => {
    expect(parseReleaseNoteTranslations(input)).toEqual({});
  });

  it('drops a language the app no longer ships', () => {
    expect(parseReleaseNoteTranslations({ fr: { title: 'Pont', body: 'Déplacez.' } })).toEqual({});
  });

  // Postgres only guarantees the column is an object; everything else is on us.
  it.each([
    ['null', null],
    ['an array', [{ title: 'x', body: 'y' }]],
    ['a string', 'es'],
    ['a nested array', { es: ['Puente', 'Mové USDC.'] }],
  ])('returns nothing for %s', (_label, input) => {
    expect(parseReleaseNoteTranslations(input)).toEqual({});
  });

  it('keeps the good language and drops the broken one', () => {
    const parsed = parseReleaseNoteTranslations({
      es: { title: 'Puente', body: 'Mové USDC.' },
      pt: { title: 'Ponte' },
    });
    expect(parsed).toEqual({ es: { title: 'Puente', body: 'Mové USDC.' } });
  });
});

describe('resolveReleaseNoteText', () => {
  const translated = { ...note, translations: { es: { title: 'Puente USDC', body: 'Mové USDC.' } } };

  it('returns the translation when there is one', () => {
    expect(resolveReleaseNoteText(translated, 'es')).toEqual({ title: 'Puente USDC', body: 'Mové USDC.' });
  });

  // The whole point of the design: publishing with one language written must
  // still show something to everyone else.
  it.each([
    ['a language with no translation', 'pt'],
    ['a language we do not ship', 'fr'],
    ['no language at all', undefined],
    ['an empty string', ''],
  ])('falls back to the base text for %s', (_label, language) => {
    expect(resolveReleaseNoteText(translated, language)).toEqual(note);
  });

  // i18next hands over whatever the browser reports.
  it.each(['es-419', 'es-AR', 'ES', 'es-ES'])('matches the regional variant %s', (language) => {
    expect(resolveReleaseNoteText(translated, language).title).toBe('Puente USDC');
  });

  it('falls back when the note carries no translations field at all', () => {
    expect(resolveReleaseNoteText(note, 'es')).toEqual(note);
  });
});

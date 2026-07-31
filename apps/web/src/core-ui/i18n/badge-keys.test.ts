import { describe, expect, it } from 'vitest';

import { FALLBACK_BADGE_META } from '../data/profile-badges';
import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import { SUPPORTED_LANGUAGES } from './index';

// Badge copy is looked up by key — `t(\`achievements.items.${badge.id}.title\`)`
// in AchievementModal, BadgeTile and LeaderboardBadgeModal — with the raw
// backend name as the fallback. A key that does not resolve therefore renders
// the English database column instead of the translation, in every locale, and
// nothing reports it. These assertions are the only thing standing between a
// misspelled key and silently untranslated badges.

const LOCALES = { en, es, pt } as const;

type Entry = { title?: string; description?: string };
const itemsOf = (bundle: (typeof LOCALES)[keyof typeof LOCALES]): Record<string, Entry> =>
  bundle.achievements.items as Record<string, Entry>;

describe('badge translation keys', () => {
  it('covers every locale the app ships', () => {
    expect(Object.keys(LOCALES).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it('translates every badge in the static catalog, in every locale', () => {
    for (const [lng, bundle] of Object.entries(LOCALES)) {
      const items = itemsOf(bundle);
      const missing = FALLBACK_BADGE_META.filter((b) => !items[b.id]).map((b) => b.id);
      expect(missing, `${lng}: badges without an achievements.items entry`).toEqual([]);
    }
  });

  it('gives every entry a non-empty title and description', () => {
    for (const [lng, bundle] of Object.entries(LOCALES)) {
      for (const [key, entry] of Object.entries(itemsOf(bundle))) {
        expect(entry.title?.trim(), `${lng}.${key}.title`).toBeTruthy();
        expect(entry.description?.trim(), `${lng}.${key}.description`).toBeTruthy();
      }
    }
  });

  it('keeps the three locales on exactly the same key set', () => {
    const [reference, ...rest] = Object.entries(LOCALES);
    const expected = Object.keys(itemsOf(reference[1])).sort();
    for (const [lng, bundle] of rest) {
      expect(Object.keys(itemsOf(bundle)).sort(), `${lng} drifted from ${reference[0]}`).toEqual(expected);
    }
  });

  // The database spells keys with underscores. A hyphenated key here is not a
  // style problem — it is an entry no lookup will ever reach.
  it('spells every key the way the database does', () => {
    for (const [lng, bundle] of Object.entries(LOCALES)) {
      const hyphenated = Object.keys(itemsOf(bundle)).filter((key) => key.includes('-'));
      expect(hyphenated, `${lng}: keys the backend will never send`).toEqual([]);
    }
  });
});

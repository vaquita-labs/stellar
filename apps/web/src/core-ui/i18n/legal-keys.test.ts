import { describe, expect, it } from 'vitest';

import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';

// The legal bundle is the one place where a missing translation is not a
// cosmetic bug: the acceptance gate records that the user agreed to these
// documents, and a key that falls back to its own path string means the user
// accepted something they could not read. These assertions cover the whole
// `auth.privacy` / `auth.terms` / `auth.risk` / `auth.legalGate` subtree, and
// the interpolation placeholder the acceptance gate depends on.

const LOCALES = { en, es, pt } as const;
const NAMESPACES = ['privacy', 'terms', 'risk', 'legalGate'] as const;

type Json = string | { [key: string]: Json };

/** Flattens a nested bundle into `a.b.c` → value pairs. */
const flatten = (value: Json, prefix = ''): Record<string, string> => {
  if (typeof value === 'string') return { [prefix]: value };
  return Object.entries(value).reduce<Record<string, string>>(
    (acc, [key, child]) => Object.assign(acc, flatten(child, prefix ? `${prefix}.${key}` : key)),
    {},
  );
};

const legalKeysOf = (bundle: (typeof LOCALES)[keyof typeof LOCALES]) => {
  const auth = bundle.auth as unknown as Record<string, Json>;
  return NAMESPACES.reduce<Record<string, string>>(
    (acc, ns) => Object.assign(acc, flatten(auth[ns], ns)),
    {},
  );
};

describe('legal translation keys', () => {
  it('keeps the three locales on exactly the same key set', () => {
    const expected = Object.keys(legalKeysOf(en)).sort();
    for (const [lng, bundle] of Object.entries(LOCALES)) {
      expect(Object.keys(legalKeysOf(bundle)).sort(), `${lng} drifted from en`).toEqual(expected);
    }
  });

  it('leaves no legal string empty', () => {
    for (const [lng, bundle] of Object.entries(LOCALES)) {
      for (const [key, value] of Object.entries(legalKeysOf(bundle))) {
        expect(value.trim(), `${lng}.auth.${key}`).toBeTruthy();
      }
    }
  });

  // A `<b>` opened and never closed silently swallows the rest of the sentence
  // when <Trans> renders it, which in a policy means dropped disclosure text.
  it('balances the inline tags <Trans> has to resolve', () => {
    const tags = ['b', 'a', 'privacy', 'terms', 'risk'];
    for (const [lng, bundle] of Object.entries(LOCALES)) {
      for (const [key, value] of Object.entries(legalKeysOf(bundle))) {
        for (const tag of tags) {
          const open = value.split(`<${tag}>`).length - 1;
          const close = value.split(`</${tag}>`).length - 1;
          expect(open, `${lng}.auth.${key}: unbalanced <${tag}>`).toBe(close);
        }
      }
    }
  });

  // `versionLabel` names the policy revision the user is agreeing to, right
  // above the confirm button. A locale that dropped the placeholder would show
  // an acceptance prompt for an unnamed version.
  it('keeps the version placeholder in every locale', () => {
    for (const [lng, bundle] of Object.entries(LOCALES)) {
      const value = legalKeysOf(bundle)['legalGate.versionLabel'];
      expect(value, `${lng}.auth.legalGate.versionLabel is missing {{version}}`).toContain(
        '{{version}}',
      );
    }
  });
});

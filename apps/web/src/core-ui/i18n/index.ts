'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';

/**
 * App-wide i18n setup (react-i18next).
 *
 * - The locale is driven by the user's profile preference (`profile.language`)
 *   and applied at runtime via {@link I18nProvider}; this module only wires up
 *   the resources, the fallback chain and interpolation. There is intentionally
 *   no URL-based locale routing — the language lives on the profile, not the
 *   path — so a lightweight react-i18next instance fits better than next-intl.
 * - A single default namespace (`translation`) with hierarchical keys
 *   (`home.*`, `profile.*`, `shop.*`, …) keeps lookups simple and lets each
 *   area own its own slice of the dictionary without colliding.
 * - `useSuspense: false` so a missing key/locale never suspends a tree mid-render.
 */

export const SUPPORTED_LANGUAGES = ['en', 'es', 'pt'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export const isSupportedLanguage = (value: unknown): value is AppLanguage =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

export const resources = {
  en: { translation: en },
  es: { translation: es },
  pt: { translation: pt },
} as const;

// Guard against double-init across Fast Refresh / multiple imports.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    defaultNS: 'translation',
    interpolation: {
      // React already escapes output, so i18next must not double-escape.
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    returnNull: false,
  });
} else {
  // Fast Refresh re-runs this module but skips init above, which would leave
  // stale locale JSON in memory until a full reload — re-register the bundles.
  for (const [lng, ns] of Object.entries(resources)) {
    i18n.addResourceBundle(lng, 'translation', ns.translation, true, true);
  }
}

export default i18n;

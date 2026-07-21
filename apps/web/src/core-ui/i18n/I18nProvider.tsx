'use client';

import { ReactNode, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { useProfileData } from '@/core-ui/hooks';
import i18n, { AppLanguage, DEFAULT_LANGUAGE, isSupportedLanguage } from './index';

const STORAGE_KEY = 'vaquita-lang';

/** Read the last locale we persisted (set after login / on manual change). */
const readStoredLanguage = (): AppLanguage | null => {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isSupportedLanguage(stored) ? stored : null;
};

/** Best-effort guess from the browser before we know the user's preference. */
const readBrowserLanguage = (): AppLanguage | null => {
  if (typeof navigator === 'undefined') return null;
  const prefix = navigator.language?.slice(0, 2).toLowerCase();
  return isSupportedLanguage(prefix) ? prefix : null;
};

/** Apply a locale to i18next, the persisted store and `<html lang>`. */
const applyLanguage = (language: AppLanguage) => {
  if (i18n.language !== language) void i18n.changeLanguage(language);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }
};

/**
 * Drives the active locale across the whole app.
 *
 * Resolution order: the signed-in user's saved profile preference wins; before
 * that resolves (or on public/anonymous routes where the profile query is
 * disabled) we fall back to the last persisted choice, then the browser
 * language, then {@link DEFAULT_LANGUAGE}. Because it reads `useProfileData`,
 * changing the language on the Preferences page (which refetches the profile)
 * re-applies here automatically — no reload needed.
 *
 * Mounted high in the tree (above the auth gate) so login and other public
 * screens are translated too.
 */
export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const { data } = useProfileData();
  const profileLanguage = data?.language;

  // Apply the early fallback (stored → browser) once on mount, so the very
  // first paint isn't stuck on the default before the profile arrives.
  useEffect(() => {
    const initial = readStoredLanguage() ?? readBrowserLanguage();
    if (initial) applyLanguage(initial);
  }, []);

  // Profile preference is the source of truth once it's available.
  useEffect(() => {
    if (isSupportedLanguage(profileLanguage)) applyLanguage(profileLanguage);
  }, [profileLanguage]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
};

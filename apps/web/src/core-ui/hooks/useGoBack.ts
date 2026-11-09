'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Back for a screen that is reached from several places (the home, a
 * notification, a list): it returns through the history, to wherever the user
 * was, instead of always sending them to one fixed parent. Opened from a direct
 * link (a new tab) there is nowhere to return to: only then it lands on
 * `fallbackHref` rather than leaving the app.
 */
export const useGoBack = (fallbackHref: string) => {
  const router = useRouter();
  return useCallback(() => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace(fallbackHref);
    }
  }, [router, fallbackHref]);
};

'use client';

import { useEffect } from 'react';

/**
 * Keeps the `--vh` CSS custom property in sync with the real viewport height.
 * Extracted from `Providers` so the layout effect lives on its own.
 */
export function useViewportVh() {
  useEffect(() => {
    const listener = () => {
      const vh = window.innerHeight * 0.01;
      document?.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    listener();
    window?.addEventListener('resize', listener);
    return () => window?.removeEventListener('resize', listener);
  }, []);
}
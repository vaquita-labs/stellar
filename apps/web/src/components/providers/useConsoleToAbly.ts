'use client';

import { sendLogToAbly } from '@/core-ui/components';
import { useEffect } from 'react';

type ConsoleLevel = 'log' | 'info' | 'error' | 'warn';

/**
 * Mirrors `console` output to Ably in production. Previously this patched the
 * global `console` as an import side-effect; now the patch is installed once on
 * mount and reverted on unmount, and a re-entrancy guard prevents any logging
 * inside `sendLogToAbly` from recursing back through the patched console.
 */
export function useConsoleToAbly() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return;

    const original: Record<ConsoleLevel, (...args: unknown[]) => void> = {
      log: console.log,
      info: console.info,
      error: console.error,
      warn: console.warn,
    };

    let sending = false;
    const patch =
      (level: ConsoleLevel) =>
      (...args: unknown[]) => {
        original[level](...args);
        if (sending) return;
        sending = true;
        try {
          void sendLogToAbly(level, args);
        } finally {
          sending = false;
        }
      };

    console.log = patch('log');
    console.info = patch('info');
    console.error = patch('error');
    console.warn = patch('warn');

    return () => {
      console.log = original.log;
      console.info = original.info;
      console.error = original.error;
      console.warn = original.warn;
    };
  }, []);
}
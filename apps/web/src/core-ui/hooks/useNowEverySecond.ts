'use client';

import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every second while `running`: for countdowns
 * drawn in render, where `Date.now()` itself cannot be read.
 */
export function useNowEverySecond(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

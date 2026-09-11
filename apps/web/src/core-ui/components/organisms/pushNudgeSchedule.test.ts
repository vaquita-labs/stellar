import { afterEach, describe, expect, it } from 'vitest';
import { ASK_INTERVAL_MS, canAskNow, markAsked } from './pushNudgeSchedule';

// The web suite runs on `environment: 'node'`, so there is no window at all.
// These build one with just the two stores the module touches — which is also
// how "storage throws" is exercised, since that is a real browser state (Safari
// private mode, some embedded webviews) and not a hypothetical.
const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};

const throwingStorage = () => ({
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
});

type Stores = { sessionStorage: unknown; localStorage: unknown };

const setWindow = (stores: Stores) => {
  (globalThis as { window?: unknown }).window = stores;
};

/** A cold start of the app: session state is gone, device state survives. */
const relaunch = (stores: Stores) => {
  stores.sessionStorage = memoryStorage();
  setWindow(stores);
};

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const NOW = 1_757_500_000_000;

describe('push nudge schedule', () => {
  it('asks on a first launch', () => {
    setWindow({ sessionStorage: memoryStorage(), localStorage: memoryStorage() });
    expect(canAskNow(NOW)).toBe(true);
  });

  it('stays quiet for the rest of the launch once asked', () => {
    setWindow({ sessionStorage: memoryStorage(), localStorage: memoryStorage() });
    markAsked(NOW);
    expect(canAskNow(NOW + 1000)).toBe(false);
  });

  it('stays quiet on a relaunch inside the 24h floor', () => {
    const stores = { sessionStorage: memoryStorage(), localStorage: memoryStorage() };
    setWindow(stores);
    markAsked(NOW);

    relaunch(stores);
    expect(canAskNow(NOW + ASK_INTERVAL_MS - 1)).toBe(false);
  });

  it('asks again on a relaunch after the floor', () => {
    const stores = { sessionStorage: memoryStorage(), localStorage: memoryStorage() };
    setWindow(stores);
    markAsked(NOW);

    relaunch(stores);
    expect(canAskNow(NOW + ASK_INTERVAL_MS)).toBe(true);
  });

  it('asks when storage is unavailable', () => {
    // Losing the channel is worse than one extra modal, so a blocked store
    // fails towards asking rather than towards silence.
    setWindow({ sessionStorage: throwingStorage(), localStorage: throwingStorage() });
    expect(canAskNow(NOW)).toBe(true);
    expect(() => markAsked(NOW)).not.toThrow();
    expect(canAskNow(NOW)).toBe(true);
  });

  it('asks when there is no window at all', () => {
    expect(canAskNow(NOW)).toBe(true);
  });
});

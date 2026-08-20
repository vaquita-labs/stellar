import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cached, clearCached } from './cached';

const TTL = 10 * 60 * 1000;
const NEGATIVE_TTL = 30 * 1000;
const opts = { ttlMs: TTL, negativeTtlMs: NEGATIVE_TTL };

/** A deferred promise, so a load can be held open while other callers arrive. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  clearCached();
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cached', () => {
  it('serves the cached value without reloading inside the TTL', async () => {
    const load = vi.fn().mockResolvedValue(7);

    expect(await cached('k', load, opts)).toBe(7);
    vi.setSystemTime(TTL - 1);
    expect(await cached('k', load, opts)).toBe(7);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads once the TTL has elapsed', async () => {
    const load = vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(9);

    expect(await cached('k', load, opts)).toBe(7);
    vi.setSystemTime(TTL);
    expect(await cached('k', load, opts)).toBe(9);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keys entries independently', async () => {
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cached('a', load, opts)).toBe(1);
    expect(await cached('b', load, opts)).toBe(2);
    expect(await cached('a', load, opts)).toBe(1);

    expect(load).toHaveBeenCalledTimes(2);
  });

  describe('single-flight', () => {
    it('collapses concurrent misses into one load', async () => {
      const gate = deferred<number>();
      const load = vi.fn().mockReturnValue(gate.promise);

      const calls = [cached('k', load, opts), cached('k', load, opts), cached('k', load, opts)];
      gate.resolve(7);

      expect(await Promise.all(calls)).toEqual([7, 7, 7]);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('collapses the stampede at expiry, not just on a cold cache', async () => {
      const first = deferred<number>();
      const second = deferred<number>();
      const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      first.resolve(7);
      await cached('k', load, opts);

      vi.setSystemTime(TTL);
      const stampede = Array.from({ length: 50 }, () => cached('k', load, opts));
      second.resolve(9);

      expect(await Promise.all(stampede)).toEqual(Array(50).fill(9));
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('releases the in-flight slot after a rejection so the next call retries', async () => {
      const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(7);

      await expect(cached('k', load, opts)).rejects.toThrow('down');
      expect(await cached('k', load, opts)).toBe(7);

      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  describe('negative caching', () => {
    it('holds a failed lookup for the negative TTL rather than the full TTL', async () => {
      const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(7);

      expect(await cached('k', load, opts)).toBeNull();

      // Still inside the negative TTL: the upstream is not called again.
      vi.setSystemTime(NEGATIVE_TTL - 1);
      expect(await cached('k', load, opts)).toBeNull();
      expect(load).toHaveBeenCalledTimes(1);

      vi.setSystemTime(NEGATIVE_TTL);
      expect(await cached('k', load, opts)).toBe(7);
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('rejects when the load throws and nothing good was ever cached', async () => {
      const load = vi.fn().mockRejectedValue(new Error('down'));

      await expect(cached('k', load, opts)).rejects.toThrow('down');
    });

    it('honours a custom isNegative predicate', async () => {
      const load = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(7);
      const withPredicate = { ...opts, isNegative: (value: number) => value === 0 };

      expect(await cached('k', load, withPredicate)).toBe(0);
      vi.setSystemTime(NEGATIVE_TTL);
      expect(await cached('k', load, withPredicate)).toBe(7);
    });
  });

  describe('stale-on-error', () => {
    it('serves the last good value when the load starts returning failures', async () => {
      const load = vi.fn().mockResolvedValueOnce(7).mockResolvedValue(null);

      expect(await cached('k', load, opts)).toBe(7);
      vi.setSystemTime(TTL);
      expect(await cached('k', load, opts)).toBe(7);
    });

    it('serves the last good value when the load starts throwing', async () => {
      const load = vi.fn().mockResolvedValueOnce(7).mockRejectedValue(new Error('down'));

      expect(await cached('k', load, opts)).toBe(7);
      vi.setSystemTime(TTL);
      await expect(cached('k', load, opts)).resolves.toBe(7);
    });

    it('retries on the negative TTL while holding the stale value over', async () => {
      const load = vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(null).mockResolvedValueOnce(9);

      expect(await cached('k', load, opts)).toBe(7);

      vi.setSystemTime(TTL);
      expect(await cached('k', load, opts)).toBe(7);
      expect(load).toHaveBeenCalledTimes(2);

      // Held over, so no retry until the shorter negative TTL is up.
      vi.setSystemTime(TTL + NEGATIVE_TTL - 1);
      expect(await cached('k', load, opts)).toBe(7);
      expect(load).toHaveBeenCalledTimes(2);

      vi.setSystemTime(TTL + NEGATIVE_TTL);
      expect(await cached('k', load, opts)).toBe(9);
      expect(load).toHaveBeenCalledTimes(3);
    });

    it('goes back to the full TTL once the upstream recovers', async () => {
      const load = vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(null).mockResolvedValueOnce(9);

      await cached('k', load, opts);
      vi.setSystemTime(TTL);
      await cached('k', load, opts);
      vi.setSystemTime(TTL + NEGATIVE_TTL);
      expect(await cached('k', load, opts)).toBe(9);

      vi.setSystemTime(TTL + NEGATIVE_TTL + TTL - 1);
      expect(await cached('k', load, opts)).toBe(9);
      expect(load).toHaveBeenCalledTimes(3);
    });

    it('keeps holding the last good value across a prolonged outage', async () => {
      const load = vi.fn().mockResolvedValueOnce(7).mockResolvedValue(null);

      expect(await cached('k', load, opts)).toBe(7);
      for (let elapsed = TTL; elapsed < TTL + NEGATIVE_TTL * 20; elapsed += NEGATIVE_TTL) {
        vi.setSystemTime(elapsed);
        expect(await cached('k', load, opts)).toBe(7);
      }
    });
  });
});

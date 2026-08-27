/**
 * Process-local TTL cache with single-flight refresh and stale-on-error.
 *
 * Built for read-through caching of small, slow-moving upstream reads (the
 * DeFindex vault APY being the first) where the upstream imposes a rate limit.
 * Three behaviours matter more than the TTL itself:
 *
 * - **Single-flight.** Concurrent misses share one in-flight load instead of
 *   racing, so an expiry under load costs one upstream call, not one per
 *   request. This — not the steady-state rate — is what trips rate limits.
 * - **Negative TTL.** A failed load is cached only briefly, so one blip does
 *   not pin a bad value for the full TTL.
 * - **Stale-on-error.** Once a good value has been seen it is held over and
 *   served while the upstream is failing, rather than falling back to whatever
 *   the failure case returns.
 *
 * The cache is per-process and does not survive a restart: on a cold start
 * during an upstream outage there is no last-good value to serve. Persisting
 * one is a separate concern and deliberately not handled here.
 */

type CacheEntry<T> = {
  /** Best value available to serve — freshly loaded, or a held-over last-good one. */
  value: T;
  /** Epoch ms after which the next read triggers a refresh. */
  expiresAt: number;
  /** Last non-negative value seen, retained across failures for stale-on-error. */
  lastGood?: T;
};

export type CachedOptions<T> = {
  /** How long a successful value stays fresh. */
  ttlMs: number;
  /** How long a failed load is cached before retrying. Defaults to `ttlMs`. */
  negativeTtlMs?: number;
  /**
   * Whether a resolved value represents a failed lookup rather than real data.
   * Defaults to nullish, which covers loaders that signal failure by returning
   * `null` instead of throwing.
   */
  isNegative?: (value: T) => boolean;
};

const entries = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

const isNullish = (value: unknown) => value == null;

/**
 * Read `key` from cache, loading through `load` on a miss.
 *
 * Rejects only when `load` rejects and no previous good value exists; otherwise
 * a failing load resolves to the last good value, or to whatever `load`
 * returned if there has never been one.
 */
export async function cached<T>(key: string, load: () => Promise<T>, options: CachedOptions<T>): Promise<T> {
  const { ttlMs, negativeTtlMs = ttlMs, isNegative = isNullish } = options;

  const previous = entries.get(key) as CacheEntry<T> | undefined;
  if (previous && previous.expiresAt > Date.now()) return previous.value;

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  // Hold over the last good value if this refresh fails, and retry on the
  // shorter negative TTL rather than waiting out a full one.
  const holdOver = (): T => {
    const lastGood = previous?.lastGood as T;
    entries.set(key, { value: lastGood, expiresAt: Date.now() + negativeTtlMs, lastGood });
    return lastGood;
  };
  const hasLastGood = previous !== undefined && 'lastGood' in previous;

  const refresh = (async (): Promise<T> => {
    let value: T;
    try {
      value = await load();
    } catch (error) {
      if (hasLastGood) return holdOver();
      throw error;
    }

    if (isNegative(value)) {
      if (hasLastGood) return holdOver();
      // Nothing better to serve: cache the failure briefly so a sustained
      // outage on a cold cache does not hammer the upstream.
      entries.set(key, { value, expiresAt: Date.now() + negativeTtlMs });
      return value;
    }

    entries.set(key, { value, expiresAt: Date.now() + ttlMs, lastGood: value });
    return value;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, refresh);
  return refresh;
}

/** Drop all cached values. Intended for tests. */
export function clearCached(): void {
  entries.clear();
  inFlight.clear();
}

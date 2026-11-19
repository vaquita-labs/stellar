import { type Request, type Response } from 'express';
import { apiEnv } from '../config/env';
import { secretMatches } from './adminSecret';

/**
 * Gate for the partner (server-to-server) endpoints: the caller must send
 * PARTNER_API_KEY in the `x-api-key` header. Fail-closed: with the env var
 * unset the endpoints answer 503 for everybody, there is no open mode.
 *
 * SINGLE-PARTNER DESIGN. One key in an env var, one shared rate-limit bucket.
 * That is enough for one integration. To onboard MORE partners, change this:
 *
 *  1. Keys table (needs a migration), e.g. `partner_api_keys`:
 *     id, partner_name, key_hash (SHA-256 of the key, NEVER the key itself),
 *     created_at, revoked_at, last_used_at. Look the key up by its hash, so one
 *     partner can be revoked or rotated without touching the others. Env-var
 *     keys cannot be revoked individually and need a redeploy to change.
 *  2. Rate limit PER KEY: replace the single bucket below with a Map keyed by
 *     the partner id, so one noisy partner cannot spend another's quota.
 *  3. Shared limiter store (Redis or a DB counter). The bucket below lives in
 *     process memory and the API runs as a PM2 cluster, so each instance counts
 *     on its own and the real ceiling is LIMIT x instances. Tolerable for one
 *     partner, not for per-partner quotas someone is billed or blocked on.
 *  4. Per-partner audit trail: log the partner id on every lookup (today the
 *     log only says "the partner"), plus an optional IP allowlist per partner.
 *  5. Admin screen to mint/revoke keys (show the key once, store the hash).
 */

/** Lookups allowed per window, per API instance. */
export const PARTNER_RATE_LIMIT = 60;
export const PARTNER_RATE_WINDOW_MS = 60_000;

// The limit exists to stop a leaked key (or the partner) from walking the
// namespace and dumping every tag -> wallet pair. It only counts requests that
// already carried the right key: counting rejected ones too would let anyone
// on the internet exhaust the bucket and lock the real partner out.
let windowStartedAt = Number.NEGATIVE_INFINITY;
let windowCount = 0;

/** Test hook: forget the current window. */
export function resetPartnerRateLimit(): void {
  windowStartedAt = Number.NEGATIVE_INFINITY;
  windowCount = 0;
}

export function requirePartnerApiKey(req: Request, res: Response, now = Date.now()): boolean {
  const expected = apiEnv.PARTNER_API_KEY;
  if (!expected) {
    req.log.warn({ event: 'partner_api_disabled', path: req.path }, 'partner API called but PARTNER_API_KEY is not set');
    res.status(503).json({ status: 'error', message: 'Partner API is not enabled' });
    return false;
  }

  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || !secretMatches(provided, expected)) {
    // A burst of these is someone guessing the key.
    req.log.warn({ event: 'partner_api_key_rejected', ip: req.ip, path: req.path }, 'partner API key rejected');
    res.status(401).json({ status: 'error', message: 'Invalid or missing API key' });
    return false;
  }

  if (now - windowStartedAt >= PARTNER_RATE_WINDOW_MS) {
    windowStartedAt = now;
    windowCount = 0;
  }
  windowCount += 1;

  if (windowCount > PARTNER_RATE_LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStartedAt + PARTNER_RATE_WINDOW_MS - now) / 1000));
    req.log.warn({ event: 'partner_api_rate_limited', ip: req.ip, path: req.path }, 'partner API rate limit hit');
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({ status: 'error', message: 'Too many requests' });
    return false;
  }

  return true;
}

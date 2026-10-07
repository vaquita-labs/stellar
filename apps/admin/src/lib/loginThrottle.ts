import type { NextRequest } from 'next/server';

// Brute-force brake for the passcode login, per client address.
//
// In-memory on purpose: the admin app runs as one process, and a restart
// forgetting the counters costs an attacker nothing they could not get by
// waiting out the window. If the app is ever scaled to several instances the
// counters need a shared store, which is also the point to move to per-person
// accounts rather than to polish a shared passcode.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

type Entry = { failures: number; firstFailureAt: number; lockedUntil: number };
const attempts = new Map<string, Entry>();

// The app sits behind the Dokploy proxy, so the socket address is the proxy's;
// the caller is the first hop of x-forwarded-for. Everything else collapses
// into one bucket, which only makes the brake stricter.
export function clientAddress(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

/** Seconds the caller still has to wait, or 0 when a login may be attempted. */
export function retryAfterSeconds(address: string, now = Date.now()): number {
  const entry = attempts.get(address);
  if (!entry) return 0;
  if (entry.lockedUntil > now) return Math.ceil((entry.lockedUntil - now) / 1000);
  if (now - entry.firstFailureAt > WINDOW_MS) attempts.delete(address);
  return 0;
}

/** Count a wrong passcode. Returns the lockout in seconds when this one tripped it. */
export function recordFailure(address: string, now = Date.now()): number {
  const entry = attempts.get(address);
  const fresh = !entry || now - entry.firstFailureAt > WINDOW_MS;
  const next: Entry = fresh
    ? { failures: 1, firstFailureAt: now, lockedUntil: 0 }
    : { ...entry, failures: entry.failures + 1 };
  if (next.failures >= MAX_FAILURES) next.lockedUntil = now + LOCKOUT_MS;
  attempts.set(address, next);
  return next.lockedUntil > now ? Math.ceil(LOCKOUT_MS / 1000) : 0;
}

export function recordSuccess(address: string): void {
  attempts.delete(address);
}

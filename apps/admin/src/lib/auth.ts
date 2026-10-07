// Passcode-based session auth shared by the Next.js middleware (edge runtime)
// and the /api/auth route handlers (node runtime). Uses Web Crypto — available
// in BOTH runtimes — so there is no Node-only `crypto`/`Buffer` dependency.

import { getServerEnv } from '@/core-ui/config/serverEnv';

export const SESSION_COOKIE = 'vaquita_admin_session';

// Cookie lifetime: 12 hours. A working day, not a week: a cookie that leaks
// from a laptop stops being useful by the next morning.
export const SESSION_MAX_AGE = 60 * 60 * 12;

/**
 * Server-only passcode (required, validated with zod). It is NOT prefixed with
 * NEXT_PUBLIC_, so it never ships to the browser. There is no open mode: the
 * gate is always on.
 */
export function getPasscode(): string {
  return getServerEnv().ADMIN_PASSCODE;
}

// Token layout: `v2.<payload>.<signature>`, both parts base64url.
//   payload   = JSON { sid, iat, exp } — a random session id and its window
//   signature = HMAC-SHA256(key = passcode, payload)
//
// v1 was a single HMAC of a constant, so every login produced the SAME cookie
// and it never expired on its own: one leaked cookie was a permanent key, and
// the only way to cut it off was to change the passcode for everyone. v2
// cookies are distinct per login and die at `exp`, so a future revocation list
// has something to name. Changing the passcode still invalidates all of them.
const TOKEN_VERSION = 'v2';

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(passcode: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(passcode), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(passcode: string, payload: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(passcode), enc.encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

/** Mint a fresh session token: a new random id, valid for SESSION_MAX_AGE. */
export async function issueSession(passcode: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const sid = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = toBase64Url(enc.encode(JSON.stringify({ sid, iat: now, exp: now + SESSION_MAX_AGE })));
  return `${TOKEN_VERSION}.${payload}.${await sign(passcode, payload)}`;
}

// Constant-time string comparison to avoid leaking the token via timing.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// True when `cookieValue` is an unexpired session signed with the configured
// passcode. Anything malformed, including a v1 cookie, is simply invalid: the
// holder gets the login page and signs in again.
export async function isValidSession(cookieValue: string | undefined, passcode: string): Promise<boolean> {
  if (!cookieValue) return false;
  const [version, payload, signature, ...rest] = cookieValue.split('.');
  if (version !== TOKEN_VERSION || !payload || !signature || rest.length > 0) return false;

  const expected = await sign(passcode, payload);
  if (!timingSafeEqual(signature, expected)) return false;

  const bytes = fromBase64Url(payload);
  if (!bytes) return false;
  try {
    const claims = JSON.parse(dec.decode(bytes)) as { exp?: unknown };
    return typeof claims.exp === 'number' && claims.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

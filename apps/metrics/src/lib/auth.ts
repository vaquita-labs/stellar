// Passcode-based session auth shared by the Next.js proxy (edge runtime) and
// the /api/auth route handlers (node runtime). Same scheme as apps/admin:
// Web Crypto only, so there is no Node-only `crypto`/`Buffer` dependency.

import { getServerEnv } from '@/lib/serverEnv';

export const SESSION_COOKIE = 'vaquita_metrics_session';

// Cookie lifetime: 7 days.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export function getPasscode(): string {
  return getServerEnv().METRICS_PASSCODE;
}

const SESSION_MESSAGE = 'vaquita-metrics-session-v1';

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** HMAC-SHA256(passcode, constant) — the cookie value. Cannot be forged without the passcode. */
export async function sessionToken(passcode: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(passcode), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(SESSION_MESSAGE));
  return toHex(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined, passcode: string): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await sessionToken(passcode);
  return timingSafeEqual(cookieValue, expected);
}

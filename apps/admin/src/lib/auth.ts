// Passcode-based session auth shared by the Next.js middleware (edge runtime)
// and the /api/auth route handlers (node runtime). Uses Web Crypto — available
// in BOTH runtimes — so there is no Node-only `crypto`/`Buffer` dependency.

export const SESSION_COOKIE = 'vaquita_admin_session';

// Cookie lifetime: 7 days.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Server-only passcode. It is NOT prefixed with NEXT_PUBLIC_, so it never ships
 * to the browser. When unset the gate runs in "open mode" (dev convenience),
 * mirroring the existing ADMIN_SECRET contract used by the admin API routes.
 */
export function getPasscode(): string | undefined {
  const v = process.env.ADMIN_PASSCODE;
  return v && v.length > 0 ? v : undefined;
}

// Constant message signed with the passcode to derive the session token.
const SESSION_MESSAGE = 'vaquita-admin-session-v1';

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deterministic session token derived from the passcode. The cookie holds this
 * token; the middleware recomputes it from ADMIN_PASSCODE and compares. Without
 * the passcode the token cannot be forged (HMAC-SHA256), and because it is a
 * derivative — never the passcode itself — the secret is not exposed.
 */
export async function sessionToken(passcode: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(passcode),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(SESSION_MESSAGE));
  return toHex(sig);
}

// Constant-time string comparison to avoid leaking the token via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// True when `cookieValue` is a valid session for the configured passcode.
export async function isValidSession(
  cookieValue: string | undefined,
  passcode: string,
): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await sessionToken(passcode);
  return timingSafeEqual(cookieValue, expected);
}

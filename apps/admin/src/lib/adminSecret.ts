import type { NextRequest } from 'next/server';
import { getServerEnv } from '@/core-ui/config/serverEnv';
import { SESSION_COOKIE, isValidSession } from '@/lib/auth';

/**
 * Shared gate of the local admin routes. Two ways in:
 *
 *  - the passcode session cookie, which is what the admin UI's own same-origin
 *    calls carry. The browser never holds ADMIN_SECRET: it used to ship in the
 *    bundle as NEXT_PUBLIC_ADMIN_SECRET, and `_next/static` is outside the
 *    passcode middleware, so anyone could read it from the JS and call the
 *    API's admin endpoints (push campaigns to every user, Ably admin tokens).
 *  - `x-admin-secret` = ADMIN_SECRET, for server-to-server callers.
 *
 * Checked here as well as in the middleware: the middleware matcher skips any
 * path containing a dot, so a dynamic segment like `/api/admin/achievements/a.b`
 * reaches the handler without passing it.
 */
export async function adminSecretOk(req: NextRequest): Promise<boolean> {
  const env = getServerEnv();
  if (req.headers.get('x-admin-secret') === env.ADMIN_SECRET) return true;
  return isValidSession(req.cookies.get(SESSION_COOKIE)?.value, env.ADMIN_PASSCODE);
}

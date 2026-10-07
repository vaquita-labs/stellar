import type { NextRequest } from 'next/server';
import { getServerEnv } from '@/core-ui/config/serverEnv';
import { SESSION_COOKIE, getPasscode, isValidSession, timingSafeEqual } from './auth';

/**
 * Shared gate of the local admin routes. A request passes when EITHER
 *
 *  - it carries a valid session cookie — the browser's path. The passcode
 *    middleware already bounces unauthenticated page loads, and this check
 *    makes each route refuse on its own too, so a change to the middleware
 *    matcher can never silently open the data routes; or
 *  - it echoes ADMIN_SECRET in `x-admin-secret` — the server-to-server path
 *    for scripts and automation.
 *
 * The browser used to send the secret as well, compiled in from a NEXT_PUBLIC_
 * variable. That put the API's admin secret in script files that the
 * middleware serves to anyone, so the browser now authenticates with its
 * cookie only and the secret stays on the server.
 */
export async function adminRequestOk(req: NextRequest): Promise<boolean> {
  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value, getPasscode())) return true;
  const provided = req.headers.get('x-admin-secret');
  return provided !== null && timingSafeEqual(provided, getServerEnv().ADMIN_SECRET);
}

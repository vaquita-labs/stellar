import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { getAccessConfig, getServerEnv } from '@/core-ui/config/serverEnv';
import { accessTokenFrom, verifyAccessToken } from './accessIdentity';
import { SESSION_COOKIE, getPasscode, isValidSession, timingSafeEqual } from './auth';

/**
 * Who is calling an admin route, and what they may do.
 *
 * Three ways in, checked in this order:
 *
 *  - `x-admin-secret` = ADMIN_SECRET: the server-to-server path for scripts.
 *    Actor 'service', always an operator.
 *  - Cloudflare Access (when configured): the request must carry a valid
 *    Access token; the email in it is the person. Their role comes from
 *    `admin_users`: a row says operator or read-only, `disabled_at` locks them
 *    out, no row means read-only — except while the table is EMPTY, when every
 *    admitted email is an operator so the first person can add the team.
 *  - The passcode session cookie (rollout, Access not configured yet): actor
 *    'passcode', operator. This is where the console was before personal
 *    sign-in and it goes away with the passcode.
 *
 * The passcode middleware already bounces unauthenticated page loads; routes
 * check again here so a change to the middleware matcher (which skips any path
 * with a dot) can never silently open the data routes.
 *
 * The browser never holds ADMIN_SECRET. It used to, compiled in from a
 * NEXT_PUBLIC_ variable, which put the API's admin secret in script files the
 * middleware serves to anyone.
 */

export type AdminRole = 'operator' | 'read-only';
export type AdminActor = { email: string; role: AdminRole; via: 'service' | 'access' | 'passcode' };

export const forbidden = (message = 'Forbidden') =>
  NextResponse.json({ status: 'error', message }, { status: 403 });

export async function adminRequest(req: NextRequest): Promise<AdminActor | null> {
  const provided = req.headers.get('x-admin-secret');
  if (provided !== null && timingSafeEqual(provided, getServerEnv().ADMIN_SECRET)) {
    return { email: 'service', role: 'operator', via: 'service' };
  }

  const access = getAccessConfig();
  if (access) {
    const identity = await verifyAccessToken(accessTokenFrom(req), access);
    if (!identity) return null;
    const role = await roleFor(identity.email);
    return role ? { email: identity.email, role, via: 'access' } : null;
  }

  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value, getPasscode())) {
    return { email: 'passcode', role: 'operator', via: 'passcode' };
  }
  return null;
}

/** Role of an admitted email per `admin_users`; null when disabled. */
export async function roleFor(email: string): Promise<AdminRole | null> {
  const row = await prisma.adminUser.findUnique({ where: { email }, select: { role: true, disabledAt: true } });
  if (row) {
    if (row.disabledAt) return null;
    return row.role === 'operator' ? 'operator' : 'read-only';
  }
  const anyRow = await prisma.adminUser.findFirst({ select: { email: true } });
  return anyRow ? 'read-only' : 'operator';
}

/** True for anyone admitted (either role). The guard for read routes. */
export async function adminRequestOk(req: NextRequest): Promise<boolean> {
  return (await adminRequest(req)) !== null;
}

/** The actor when they may write, else null. The guard for mutation routes. */
export async function requireOperator(req: NextRequest): Promise<AdminActor | null> {
  const actor = await adminRequest(req);
  return actor?.role === 'operator' ? actor : null;
}

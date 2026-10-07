import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, SESSION_MAX_AGE, getPasscode, issueSession, timingSafeEqual } from '@/lib/auth';
import { clientAddress, recordFailure, recordSuccess, retryAfterSeconds } from '@/lib/loginThrottle';
import { clientEnv } from '@/core-ui/config/clientEnv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ passcode: z.string().min(1) });

const tooMany = (seconds: number) =>
  NextResponse.json(
    { status: 'error', message: `Too many attempts. Try again in ${Math.ceil(seconds / 60)} min.` },
    { status: 429, headers: { 'Retry-After': String(seconds) } },
  );

// POST /api/auth/login — exchange the passcode for an httpOnly session cookie.
export async function POST(req: NextRequest) {
  const passcode = getPasscode();
  const address = clientAddress(req);

  const wait = retryAfterSeconds(address);
  if (wait > 0) return tooMany(wait);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: 'error', message: 'passcode is required' }, { status: 400 });
  }

  if (!timingSafeEqual(parsed.data.passcode, passcode)) {
    const lockout = recordFailure(address);
    // One line per failure, with the address: this is the signal a log monitor
    // turns into a "someone is guessing the admin passcode" incident.
    console.warn(JSON.stringify({ event: 'admin_login_rejected', address, lockedOut: lockout > 0 }));
    if (lockout > 0) return tooMany(lockout);
    return NextResponse.json({ status: 'error', message: 'Invalid passcode' }, { status: 401 });
  }

  recordSuccess(address);
  console.info(JSON.stringify({ event: 'admin_login_ok', address }));

  const res = NextResponse.json({ status: 'ok' });
  res.cookies.set(SESSION_COOKIE, await issueSession(passcode), {
    httpOnly: true,
    sameSite: 'lax',
    secure: clientEnv.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

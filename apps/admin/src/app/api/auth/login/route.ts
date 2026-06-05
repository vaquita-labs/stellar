import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, SESSION_MAX_AGE, getPasscode, sessionToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ passcode: z.string().min(1) });

// POST /api/auth/login — exchange the passcode for an httpOnly session cookie.
export async function POST(req: NextRequest) {
  const passcode = getPasscode();
  if (!passcode) {
    // No passcode configured → the gate is open, nothing to authenticate.
    return NextResponse.json(
      { status: 'error', message: 'Passcode auth is not configured' },
      { status: 400 },
    );
  }

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

  if (parsed.data.passcode !== passcode) {
    return NextResponse.json({ status: 'error', message: 'Invalid passcode' }, { status: 401 });
  }

  const res = NextResponse.json({ status: 'ok' });
  res.cookies.set(SESSION_COOKIE, await sessionToken(passcode), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

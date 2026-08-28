import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

// POST /api/auth/logout — clear the session cookie.
export async function POST() {
  const res = NextResponse.json({ status: 'ok' });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

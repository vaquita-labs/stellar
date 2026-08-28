import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, getPasscode, isValidSession } from '@/lib/auth';

// Passcode gate for the whole metrics app (Next 16 `proxy.ts` convention —
// the renamed middleware). Runs before every matched route and redirects
// unauthenticated traffic to /login.
export async function proxy(req: NextRequest) {
  const passcode = getPasscode();
  const { pathname, search } = req.nextUrl;
  const authed = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value, passcode);

  if (pathname === '/login') {
    if (authed) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (authed) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?from=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Protect every route except the auth API, Next internals and static files.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

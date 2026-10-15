import { NextResponse, type NextRequest } from 'next/server';
import { accessTokenFrom, verifyAccessToken } from '@/lib/accessIdentity';
import { SESSION_COOKIE, getPasscode, isValidSession } from '@/lib/auth';
import { getAccessConfig } from '@/lib/serverEnv';

// Two gates for the whole metrics app (Next 16 `proxy.ts` convention — the
// renamed middleware), same design as apps/admin:
//
// 1. Cloudflare Access (when configured): a request without a valid Access
//    token is refused with 403. No redirect: Access owns the login screen, and
//    a request with no token did not come through it.
// 2. The passcode session (rollout): unauthenticated traffic goes to /login.
//    Removed once Access is live everywhere.
export async function proxy(req: NextRequest) {
  const access = getAccessConfig();
  if (access && !(await verifyAccessToken(accessTokenFrom(req), access))) {
    return new NextResponse('Forbidden: this console is only reachable through Cloudflare Access.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

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

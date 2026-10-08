import { NextResponse, type NextRequest } from 'next/server';
import { accessTokenFrom, verifyAccessToken } from '@/lib/accessIdentity';
import { SESSION_COOKIE, getPasscode, isValidSession } from '@/lib/auth';
import { getAccessConfig } from '@/core-ui/config/serverEnv';

// Two gates, in order, for every matched route.
//
// 1. Cloudflare Access (when configured): the request must carry a valid
//    Access token or it is refused with 403 — no redirect, because Access owns
//    the login screen and a request without a token did not come through it.
//    The verified email travels on to handlers in `x-admin-email`, set here
//    and overwriting anything the client sent; handlers that decide anything
//    re-verify the token themselves (lib/adminSecret.ts).
// 2. The passcode session (rollout): unauthenticated traffic goes to /login.
//    This gate is removed once Access is live everywhere.
export async function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('x-admin-email');

  const access = getAccessConfig();
  if (access) {
    const identity = await verifyAccessToken(accessTokenFrom(req), access);
    if (!identity) {
      return new NextResponse('Forbidden: this console is only reachable through Cloudflare Access.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    requestHeaders.set('x-admin-email', identity.email);
  }

  const passcode = getPasscode();
  const { pathname, search } = req.nextUrl;
  const authed = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value, passcode);

  if (pathname === '/login') {
    // Already authenticated users skip the login screen.
    if (authed) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (authed) return NextResponse.next({ request: { headers: requestHeaders } });

  // Unauthenticated → bounce to the passcode page, remembering the target.
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?from=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Protect every route except the auth API, Next internals and static files
  // (anything with a file extension, e.g. /logo.png, /chains/stellar.png).
  // Data routes under /api/admin check again on their own; see lib/adminSecret.ts.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

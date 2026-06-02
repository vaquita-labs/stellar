import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, getPasscode, isValidSession } from '@/lib/auth';

// Passcode gate for the whole admin app. Runs before every matched route and
// redirects unauthenticated traffic to /login. The passcode lives only on the
// server (ADMIN_PASSCODE), so nothing sensitive reaches the browser.
export async function middleware(req: NextRequest) {
  const passcode = getPasscode();

  // Open mode: no passcode configured → gate disabled (dev convenience),
  // consistent with the ADMIN_SECRET "open when unset" behaviour in the API.
  if (!passcode) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  const authed = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value, passcode);

  if (pathname === '/login') {
    // Already authenticated users skip the login screen.
    if (authed) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (authed) return NextResponse.next();

  // Unauthenticated → bounce to the passcode page, remembering the target.
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?from=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Protect every route except the auth API, Next internals and static files
  // (anything with a file extension, e.g. /logo.png, /chains/stellar.png).
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

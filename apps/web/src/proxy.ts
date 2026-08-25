import { NextRequest, NextResponse } from 'next/server';

/**
 * Country-level access control.
 *
 * This is the *second* layer of jurisdiction control, not the first. The one
 * that actually works everywhere is the eligibility attestation recorded in
 * `legal_acceptances` — this proxy only refuses obvious traffic before it
 * reaches the app.
 *
 * The deployment runs on Dokploy behind Caddy, not Vercel, so `request.geo`
 * does not exist. The country has to arrive as a request header set by whatever
 * fronts the app (Cloudflare's `CF-IPCountry`, or a header Caddy sets from its
 * MaxMind module). **Until that upstream configuration exists, this file is
 * inert** — it is not protection on day one.
 *
 * It deliberately FAILS OPEN when the header is absent. Failing closed would
 * take the whole app down the moment a proxy config drifts, and the attestation
 * layer still applies to everyone who gets through.
 */

const COUNTRY_HEADERS = ['cf-ipcountry', 'x-vercel-ip-country', 'x-country-code'] as const;

/** Comma-separated ISO 3166-1 alpha-2 codes, e.g. "KP,IR,SY,CU,RU". */
const BLOCKED_COUNTRIES = new Set(
  (process.env.BLOCKED_COUNTRIES ?? '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean),
);

// The legal documents must stay reachable from everywhere, including from a
// blocked country — a disclosure nobody can open is not a disclosure. `/blocked`
// itself is excluded so the redirect cannot loop.
const ALWAYS_ALLOWED = ['/privacy', '/terms', '/risk', '/blocked'];

const readCountry = (request: NextRequest): string | null => {
  for (const header of COUNTRY_HEADERS) {
    const value = request.headers.get(header)?.trim().toUpperCase();
    // Cloudflare sends "XX" for traffic it cannot geolocate (e.g. Tor).
    if (value && value.length === 2 && value !== 'XX') return value;
  }
  return null;
};

export default function proxy(request: NextRequest) {
  if (BLOCKED_COUNTRIES.size === 0) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (ALWAYS_ALLOWED.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const country = readCountry(request);
  if (!country) {
    // Logged, not blocked: an absent header almost always means the proxy is
    // not configured, and silently locking everyone out is the worse failure.
    console.warn('[proxy] no country header present; allowing request', { pathname });
    return NextResponse.next();
  }

  if (BLOCKED_COUNTRIES.has(country)) {
    const url = request.nextUrl.clone();
    url.pathname = '/blocked';
    url.search = '';
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static assets — the check is a Set
  // lookup, so the cost is negligible, but there is no point running it for
  // every image request.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|vaquita|models|sounds|.*\\.(?:png|jpg|jpeg|gif|svg|webp|glb|mp3|json)$).*)'],
};

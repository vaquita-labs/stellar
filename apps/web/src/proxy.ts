import { COUNTRY_COOKIE } from '@/core-ui/helpers/detectCountry';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Country-level access control, and the only place that knows which country the
 * request came from.
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
 *
 * The same header is handed down to the client in a cookie, because the browser
 * has no way of its own to ask which country an IP belongs to. That cookie only
 * ever SUGGESTS a country (see `detectCountry`); nothing is decided with it.
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
// `/ingest` es el rewrite del analytics (next.config.ts), no una pantalla: hoy
// esto es inerte, pero apenas el proxy de arriba empiece a mandar el header, los
// POST de eventos de un país bloqueado se reescribirían a `/blocked` y la
// librería recibiría HTML donde espera JSON.
const ALWAYS_ALLOWED = ['/privacy', '/terms', '/risk', '/blocked', '/ingest'];

const readCountry = (request: NextRequest): string | null => {
  for (const header of COUNTRY_HEADERS) {
    const value = request.headers.get(header)?.trim().toUpperCase();
    // Cloudflare sends "XX" for traffic it cannot geolocate (e.g. Tor).
    if (value && value.length === 2 && value !== 'XX') return value;
  }
  return null;
};

/**
 * Publishes the country to the client. Not `httpOnly` on purpose: the whole
 * point is that the browser reads it. It carries nothing private — a two-letter
 * code the network already knew — and nothing is authorised with it.
 */
const withCountryCookie = (request: NextRequest, response: NextResponse, country: string | null) => {
  if (!country) return response;
  response.cookies.set(COUNTRY_COOKIE, country, {
    path: '/',
    sameSite: 'lax',
    // Taken from the request instead of the build mode, so it is on in every
    // https deployment and off on the plain-http dev server.
    secure: request.nextUrl.protocol === 'https:',
    // A day: long enough to outlive a session, short enough that someone who
    // travelled is not offered last week's country for a month.
    maxAge: 60 * 60 * 24,
  });
  return response;
};

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const country = readCountry(request);

  // The block is decided first: a country that cannot use the app has no
  // business getting a cookie that helps it pick a corridor.
  const enforcing =
    BLOCKED_COUNTRIES.size > 0 &&
    !ALWAYS_ALLOWED.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (enforcing) {
    if (!country) {
      // Logged, not blocked: an absent header almost always means the proxy is
      // not configured, and silently locking everyone out is the worse failure.
      console.warn('[proxy] no country header present; allowing request', { pathname });
    } else if (BLOCKED_COUNTRIES.has(country)) {
      const url = request.nextUrl.clone();
      url.pathname = '/blocked';
      url.search = '';
      return NextResponse.rewrite(url);
    }
  }

  return withCountryCookie(request, NextResponse.next(), country);
}

export const config = {
  // Everything except Next internals and static assets — the check is a Set
  // lookup, so the cost is negligible, but there is no point running it for
  // every image request.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|vaquita|models|sounds|.*\\.(?:png|jpg|jpeg|gif|svg|webp|glb|mp3|json)$).*)'],
};

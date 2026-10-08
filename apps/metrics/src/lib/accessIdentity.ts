// Who is making this request, according to Cloudflare Access.
//
// Access sits in front of the console and decides who may reach it at all
// (team emails, second factor at the identity provider). On every request it
// adds a `Cf-Access-Jwt-Assertion` header (also the `CF_Authorization` cookie)
// signed by the team's keys. We verify that token here, against the team's
// public keys and this application's AUD tag, so a request that reaches the
// origin WITHOUT going through Access — someone connecting to the server
// address directly — carries no valid token and is refused. That is what makes
// "only reachable through the identity-checking proxy" true at the app, not
// just at DNS.
//
// Web Crypto only (via jose), so this runs in the edge middleware and in the
// node route handlers alike.

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export const ACCESS_HEADER = 'cf-access-jwt-assertion';
export const ACCESS_COOKIE = 'CF_Authorization';

export type AccessIdentity = { email: string };

export type AccessConfig = {
  /** `<team>.cloudflareaccess.com` */
  teamDomain: string;
  /** The Access application's AUD tag. */
  aud: string;
};

let cachedKeys: { domain: string; getKey: JWTVerifyGetKey } | null = null;

function keysFor(teamDomain: string): JWTVerifyGetKey {
  if (!cachedKeys || cachedKeys.domain !== teamDomain) {
    cachedKeys = {
      domain: teamDomain,
      getKey: createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`)),
    };
  }
  return cachedKeys.getKey;
}

/**
 * Verify one Access token. `getKey` is injectable for tests; production uses
 * the team's remote key set. Returns the lower-cased email, or null for any
 * failure: no token, bad signature, expired, wrong audience or issuer, or a
 * service token (which carries no email and is not a person).
 */
export async function verifyAccessToken(
  token: string | null | undefined,
  config: AccessConfig,
  getKey: JWTVerifyGetKey = keysFor(config.teamDomain),
): Promise<AccessIdentity | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: `https://${config.teamDomain}`,
      audience: config.aud,
    });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    return email ? { email } : null;
  } catch {
    return null;
  }
}

/** The token as Cloudflare sends it: header first, cookie as the fallback. */
export function accessTokenFrom(req: {
  headers: Headers;
  cookies: { get(name: string): { value: string } | undefined };
}): string | null {
  return req.headers.get(ACCESS_HEADER) ?? req.cookies.get(ACCESS_COOKIE)?.value ?? null;
}

import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, ACCESS_HEADER, accessTokenFrom, verifyAccessToken } from './accessIdentity';

const config = { teamDomain: 'vaquita.cloudflareaccess.com', aud: 'a'.repeat(64) };

let getKey: JWTVerifyGetKey;
let sign: (claims: Record<string, unknown>, opts?: { aud?: string; iss?: string; exp?: string }) => Promise<string>;
let otherKeySign: (claims: Record<string, unknown>) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  getKey = async () => publicKey;
  sign = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(opts.iss ?? `https://${config.teamDomain}`)
      .setAudience(opts.aud ?? config.aud)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '10m')
      .sign(privateKey);
  otherKeySign = (claims) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(`https://${config.teamDomain}`)
      .setAudience(config.aud)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(other.privateKey);
});

describe('verifyAccessToken', () => {
  it('returns the lower-cased email of a valid token', async () => {
    const token = await sign({ email: ' Ana@Vaquita.FI ' });
    expect(await verifyAccessToken(token, config, getKey)).toEqual({ email: 'ana@vaquita.fi' });
  });

  it('rejects a missing token', async () => {
    expect(await verifyAccessToken(null, config, getKey)).toBeNull();
    expect(await verifyAccessToken('', config, getKey)).toBeNull();
  });

  it('rejects a token signed by another key', async () => {
    expect(await verifyAccessToken(await otherKeySign({ email: 'x@y.z' }), config, getKey)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await sign({ email: 'x@y.z' }, { exp: '-1m' });
    expect(await verifyAccessToken(token, config, getKey)).toBeNull();
  });

  it('rejects the wrong audience or issuer', async () => {
    expect(await verifyAccessToken(await sign({ email: 'x@y.z' }, { aud: 'b'.repeat(64) }), config, getKey)).toBeNull();
    expect(
      await verifyAccessToken(await sign({ email: 'x@y.z' }, { iss: 'https://other.cloudflareaccess.com' }), config, getKey),
    ).toBeNull();
  });

  it('rejects a service token, which carries no email', async () => {
    expect(await verifyAccessToken(await sign({ sub: '', common_name: 'svc' }), config, getKey)).toBeNull();
  });
});

describe('accessTokenFrom', () => {
  const req = (header?: string, cookie?: string) => ({
    headers: new Headers(header ? { [ACCESS_HEADER]: header } : {}),
    cookies: { get: (name: string) => (cookie && name === ACCESS_COOKIE ? { value: cookie } : undefined) },
  });

  it('prefers the header, falls back to the cookie', () => {
    expect(accessTokenFrom(req('h', 'c'))).toBe('h');
    expect(accessTokenFrom(req(undefined, 'c'))).toBe('c');
    expect(accessTokenFrom(req())).toBeNull();
  });
});

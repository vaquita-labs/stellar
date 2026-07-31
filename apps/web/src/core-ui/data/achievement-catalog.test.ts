import { afterEach, describe, expect, it, vi } from 'vitest';

import { getBadgeClaim } from './achievement-catalog';

// The share card names a person and a date. Both used to ride in on the query
// string, so a card could assert that any profile earned any badge on any date.
// The renderer now prints only what this resolver returns, which makes "no
// claim" the safe outcome: every failure path has to come back null, or the
// card starts asserting things again.

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const stubFetch = (impl: typeof fetch) => vi.stubGlobal('fetch', vi.fn(impl));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getBadgeClaim', () => {
  it('returns the claim the backend confirms', async () => {
    stubFetch(async () =>
      jsonResponse({ data: { claim: { nickname: 'oscargauss', claimedAt: '2026-07-28T21:01:00.757Z' } } }),
    );

    await expect(getBadgeClaim('trio_saver', 'oscargauss')).resolves.toEqual({
      nickname: 'oscargauss',
      claimedAt: '2026-07-28T21:01:00.757Z',
    });
  });

  it('reports the nickname as stored, not as the URL spelled it', async () => {
    stubFetch(async () => jsonResponse({ data: { claim: { nickname: 'oscargauss', claimedAt: '2026-07-28T00:00:00Z' } } }));

    const claim = await getBadgeClaim('trio_saver', 'OscarGauss');
    expect(claim?.nickname).toBe('oscargauss');
  });

  it('returns null when that profile never claimed that badge', async () => {
    stubFetch(async () => jsonResponse({ status: 'error', message: 'Claim not found' }, 404));

    await expect(getBadgeClaim('trio_saver', 'nadie')).resolves.toBeNull();
  });

  it('does not call the backend for an empty nickname', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({}));
    stubFetch(fetchSpy as unknown as typeof fetch);

    await expect(getBadgeClaim('trio_saver', '   ')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when the backend errors, rather than rendering an unverified card', async () => {
    stubFetch(async () => jsonResponse({ status: 'error' }, 500));
    await expect(getBadgeClaim('trio_saver', 'oscargauss')).resolves.toBeNull();
  });

  it('returns null when the request throws', async () => {
    stubFetch(async () => {
      throw new Error('network down');
    });
    await expect(getBadgeClaim('trio_saver', 'oscargauss')).resolves.toBeNull();
  });

  it('returns null when the payload carries no claim date', async () => {
    stubFetch(async () => jsonResponse({ data: { claim: { nickname: 'oscargauss' } } }));
    await expect(getBadgeClaim('trio_saver', 'oscargauss')).resolves.toBeNull();
  });

  it('escapes the badge key and the nickname into the URL', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ data: {} }));
    stubFetch(fetchSpy as unknown as typeof fetch);

    await getBadgeClaim('trio saver/../x', 'a b');
    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).toContain('/api/v1/badges/trio%20saver%2F..%2Fx/claim');
    expect(url).toContain('nickname=a%20b');
  });
});

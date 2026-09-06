import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flaggedCategories, moderateContent } from './index';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const clean = { flagged: false, categories: { violence: false }, category_scores: { violence: 0.01 } };
const dirty = { flagged: true, categories: { violence: true, harassment: false }, category_scores: { violence: 0.99 } };

describe('moderateContent', () => {
  beforeEach(() => {
    // The warnings are deliberate on every failure path; they just make the
    // test output unreadable.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns an unflagged verdict for clean content', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [clean] }));
    vi.stubGlobal('fetch', fetchMock);

    const verdict = await moderateContent({ apiKey: 'sk-test', text: 'the deposit button is misaligned' });

    expect(verdict).toEqual({ ok: true, flagged: false, result: clean });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/moderations');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'omni-moderation-latest',
      input: [{ type: 'text', text: 'the deposit button is misaligned' }],
    });
  });

  it('sends one image_url entry per attachment', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [clean] }));
    vi.stubGlobal('fetch', fetchMock);

    await moderateContent({ apiKey: 'sk-test', text: 'look', images: ['data:image/jpeg;base64,AAA'] });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).input).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } },
    ]);
  });

  it('reports a flagged verdict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: [dirty] })));

    const verdict = await moderateContent({ apiKey: 'sk-test', text: 'something vile' });

    expect(verdict).toEqual({ ok: true, flagged: true, result: dirty });
  });

  it('gives no verdict on a rate limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'slow down' }, 429)));

    expect(await moderateContent({ apiKey: 'sk-test', text: 'hi' })).toEqual({ ok: false, reason: 'http 429' });
  });

  it('gives no verdict on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    expect(await moderateContent({ apiKey: 'sk-test', text: 'hi' })).toEqual({ ok: false, reason: 'network error' });
  });

  it('gives no verdict when the call times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        // Never resolves on its own: the only thing that ends this call is the
        // abort the module is supposed to schedule.
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }),
    );

    expect(await moderateContent({ apiKey: 'sk-test', text: 'hi', timeoutMs: 5 })).toEqual({
      ok: false,
      reason: 'timeout',
    });
  });

  it('gives no verdict when the body has no flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: [{ categories: {} }] })));

    expect(await moderateContent({ apiKey: 'sk-test', text: 'hi' })).toEqual({
      ok: false,
      reason: 'malformed response',
    });
  });

  it('does not call out at all without a key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await moderateContent({ apiKey: '', text: 'hi' })).toEqual({ ok: false, reason: 'no api key configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to call out with nothing to check — empty is not clean', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await moderateContent({ apiKey: 'sk-test', text: '   ' })).toEqual({
      ok: false,
      reason: 'nothing to moderate',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('flaggedCategories', () => {
  it('lists only the categories that are on', () => {
    expect(flaggedCategories(dirty)).toEqual(['violence']);
  });

  it('is empty for a missing or clean result', () => {
    expect(flaggedCategories(null)).toEqual([]);
    expect(flaggedCategories(clean)).toEqual([]);
  });
});

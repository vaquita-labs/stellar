/**
 * OpenAI's moderation endpoint, wrapped so the caller can only get one of two
 * answers: a verdict, or no verdict.
 *
 * Everything that is not a well-formed 2xx — no key, 429, timeout, a body
 * without a boolean `flagged` — collapses into `{ ok: false }`. The caller
 * treats that as "hold for a human", so a bad afternoon at OpenAI degrades the
 * board into a manual queue rather than into an open door.
 *
 * `apiKey` and `host` are parameters and never read from `process.env` here:
 * same reason as `stellar/defindexApy.ts` — it keeps the module testable and
 * keeps the env read at the edge that owns it.
 */

/** The subset of the response we act on. The rest is stored verbatim for the admin. */
export interface ModerationResult {
  flagged: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
  /** Which input kinds triggered each category — 'text' vs 'image'. */
  category_applied_input_types?: Record<string, string[]>;
}

export type ModerationVerdict =
  | { ok: true; flagged: boolean; result: ModerationResult }
  | { ok: false; reason: string };

/** Only this model accepts images; the text-only ones reject the multi-modal input array. */
const MODERATION_MODEL = 'omni-moderation-latest';
const DEFAULT_HOST = 'https://api.openai.com';

interface ModerateContentParams {
  apiKey: string;
  /** Title and details joined; whatever the user typed. */
  text: string;
  /** `data:` URLs. Keep them small — the endpoint caps images at 20 MB. */
  images?: string[];
  host?: string;
  /** ms */
  timeoutMs?: number;
}

type ModerationInput =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export async function moderateContent(params: ModerateContentParams): Promise<ModerationVerdict> {
  if (!params.apiKey) return { ok: false, reason: 'no api key configured' };

  const base = (params.host ?? DEFAULT_HOST).replace(/\/+$/, '');
  const timeoutMs = params.timeoutMs ?? 10_000;

  const input: ModerationInput[] = [];
  const text = params.text.trim();
  if (text) input.push({ type: 'text', text });
  for (const url of params.images ?? []) input.push({ type: 'image_url', image_url: { url } });

  // Nothing to check is not the same as "checked and clean": an empty request
  // would come back unflagged and silently approve the post.
  if (input.length === 0) return { ok: false, reason: 'nothing to moderate' };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/v1/moderations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODERATION_MODEL, input }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[moderation] request failed', res.status, body.slice(0, 200));
      return { ok: false, reason: `http ${res.status}` };
    }

    const body = (await res.json()) as { results?: ModerationResult[] };
    const result = body?.results?.[0];
    if (!result || typeof result.flagged !== 'boolean') {
      console.warn('[moderation] unexpected response body');
      return { ok: false, reason: 'malformed response' };
    }

    return { ok: true, flagged: result.flagged, result };
  } catch (e) {
    // An abort lands here too — `AbortError` and a DNS failure are the same
    // outcome for the caller.
    console.warn('[moderation] fetch error', e);
    return { ok: false, reason: (e as Error)?.name === 'AbortError' ? 'timeout' : 'network error' };
  } finally {
    clearTimeout(t);
  }
}

/** The categories the model actually flagged. What the admin screen shows. */
export function flaggedCategories(result: ModerationResult | null | undefined): string[] {
  if (!result?.categories) return [];
  return Object.entries(result.categories)
    .filter(([, on]) => on)
    .map(([name]) => name);
}

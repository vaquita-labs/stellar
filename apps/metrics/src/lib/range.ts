// Time-range + bucket selection shared by every page. Parsed from the URL
// search params so ranges are shareable links and the pages stay server-rendered.

export const RANGES = ['30d', '90d', '180d', '365d', 'all'] as const;
export type RangeKey = (typeof RANGES)[number];

export const BUCKETS = ['day', 'week', 'month'] as const;
export type Bucket = (typeof BUCKETS)[number];

export type Range = {
  key: RangeKey;
  bucket: Bucket;
  /** Inclusive lower bound (UTC). `null` = since the first row ever. */
  since: Date | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseRange(params: SearchParams): Range {
  const rawKey = first(params.range);
  const key: RangeKey = (RANGES as readonly string[]).includes(rawKey ?? '') ? (rawKey as RangeKey) : '90d';
  const rawBucket = first(params.bucket);
  const bucket: Bucket = (BUCKETS as readonly string[]).includes(rawBucket ?? '')
    ? (rawBucket as Bucket)
    : key === '30d'
      ? 'day'
      : key === 'all' || key === '365d'
        ? 'month'
        : 'week';

  let since: Date | null = null;
  if (key !== 'all') {
    const days = Number(key.replace('d', ''));
    since = new Date(Date.now() - days * 86_400_000);
  }
  return { key, bucket, since };
}

/** Postgres interval literal for one bucket step. */
export const bucketStep = (bucket: Bucket) => ({ day: '1 day', week: '1 week', month: '1 month' })[bucket];

/** Lower bound used in SQL when the range is "all" — safely before any row. */
export const EPOCH = new Date('2024-01-01T00:00:00Z');

/** Wall clock for server components (rendered once per request, so reading it during render is fine). */
export const nowMs = () => Date.now();

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type Page = { page: number; limit: number; offset: number };

/**
 * `?page` / `?limit`, clamped. Mirrors `parseLeaderboardPageQuery` in the shared
 * leaderboard service so the two pagination contracts in the repo agree.
 *
 * Everything unparseable collapses to page 1: a bad param should show the first
 * page, not an error, and the cap is what stops `?limit=100000` from turning a
 * paginated query back into a full scan.
 */
export function parsePage(params: SearchParams): Page {
  const rawPage = Number(first(params.page));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const rawLimit = Number(first(params.limit));
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return { page, limit, offset: (page - 1) * limit };
}

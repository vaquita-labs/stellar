import { cookies } from 'next/headers';
import { parseRange, RANGE_COOKIE, type Range } from './range';

/**
 * Server half of the remembered range. Kept out of `range.ts` on purpose:
 * `next/headers` cannot be imported from a client component, and `RangePicker`
 * imports the range constants from there.
 */

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The range for a page: `?range` / `?bucket` if present, else the cookie the
 * picker wrote, else 30 days by day.
 *
 * Reading a cookie opts the route out of static rendering. Every dashboard page
 * already declares `dynamic = 'force-dynamic'` because it queries Postgres on
 * each request, so nothing changes.
 */
export async function resolveRange(params: SearchParams): Promise<Range> {
  const raw = (await cookies()).get(RANGE_COOKIE)?.value ?? '';
  const [range, bucket] = raw.split(':');
  return parseRange(params, { range, bucket });
}

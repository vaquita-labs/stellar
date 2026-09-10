'use client';

import { BUCKETS, RANGES, RANGE_COOKIE, type Bucket, type RangeKey } from '@/lib/range';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// One row of filters above the charts: range then granularity. Both are URL
// params so the page stays server-rendered and links are shareable.

// A year, because the pick is a habit rather than a session. Written from the
// browser instead of a server action: the value only has to survive until the
// next request, and a `document.cookie` write beats a round-trip for a filter
// the user flips while reading. `SameSite=Lax` is what makes it arrive on the
// navigation this click is about to start.
const remember = (range: RangeKey, bucket: Bucket) => {
  document.cookie = `${RANGE_COOKIE}=${range}:${bucket}; path=/; max-age=31536000; samesite=lax`;
};

export function RangePicker({ range, bucket }: { range: RangeKey; bucket: Bucket }) {
  const pathname = usePathname();
  const href = (r: RangeKey, b: Bucket) => `${pathname}?range=${r}&bucket=${b}`;
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active ? 'bg-black text-white' : 'bg-white text-black/70 border border-black/15 hover:bg-black/5'
    }`;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs text-black/50">Range</span>
        {RANGES.map((r) => (
          <Link key={r} href={href(r, bucket)} onClick={() => remember(r, bucket)} className={pill(r === range)}>
            {r === 'all' ? 'All time' : r}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs text-black/50">By</span>
        {BUCKETS.map((b) => (
          <Link key={b} href={href(range, b)} onClick={() => remember(range, b)} className={pill(b === bucket)}>
            {b}
          </Link>
        ))}
      </div>
    </div>
  );
}

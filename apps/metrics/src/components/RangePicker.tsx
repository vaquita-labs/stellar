'use client';

import { BUCKETS, RANGES, type Bucket, type RangeKey } from '@/lib/range';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// One row of filters above the charts: range then granularity. Both are URL
// params so the page stays server-rendered and links are shareable.
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
          <Link key={r} href={href(r, bucket)} className={pill(r === range)}>
            {r === 'all' ? 'All time' : r}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs text-black/50">By</span>
        {BUCKETS.map((b) => (
          <Link key={b} href={href(range, b)} className={pill(b === bucket)}>
            {b}
          </Link>
        ))}
      </div>
    </div>
  );
}

import Link from 'next/link';

/**
 * Prev/next for a server-rendered table.
 *
 * Links, not buttons: the page is a server component and the page number is a
 * URL param, so paging is a navigation. `params` carries the rest of the query
 * string forward — paging must not silently reset the range filter.
 */
export function Pager({
  page,
  limit,
  total,
  params,
}: {
  page: number;
  limit: number;
  total: number;
  /** Current search params to preserve, minus `page`. */
  params: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const href = (p: number) => `?${new URLSearchParams({ ...params, page: String(p) }).toString()}`;

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const pill = (enabled: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      enabled
        ? 'bg-white text-black/70 border border-black/15 hover:bg-black/5'
        : 'bg-white text-black/25 border border-black/10 pointer-events-none'
    }`;

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <span className="text-xs text-black/50">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Link href={href(page - 1)} className={pill(page > 1)} aria-disabled={page <= 1}>
          Prev
        </Link>
        <span className="px-1 text-xs text-black/50">
          {page} / {pages}
        </span>
        <Link href={href(page + 1)} className={pill(page < pages)} aria-disabled={page >= pages}>
          Next
        </Link>
      </div>
    </div>
  );
}

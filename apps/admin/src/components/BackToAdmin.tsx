'use client';

import Link from 'next/link';

// Small "back to admin index" link shown on every admin section page. The index
// lives at `/`. Lives outside the page bodies so each route gets it consistently
// (wired via the (dashboard) route-group layout and added manually to routes
// that sit outside that group, e.g. /config).
export function BackToAdmin() {
  return (
    <Link
      href="/"
      className="inline-flex w-fit items-center gap-1 rounded-md border border-black border-b-2 bg-white px-3 py-1.5 text-sm font-medium text-black shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/10"
    >
      <span aria-hidden>←</span>
      Back to admin
    </Link>
  );
}

'use client';

import Link from 'next/link';

// Small "back to /admin" link shown on every admin section page. Lives outside
// the page bodies so each route gets it consistently (wired via the /admin
// layout and added manually to routes that sit outside the /admin segment).
export function BackToAdmin() {
  return (
    <Link
      href="/admin"
      className="inline-flex w-fit items-center gap-1 rounded-md border border-black border-b-2 bg-white px-3 py-1.5 text-sm font-medium text-black shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/10"
    >
      <span aria-hidden>←</span>
      Back to admin
    </Link>
  );
}

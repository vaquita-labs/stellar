'use client';

import Link from 'next/link';

// Small "back to /admin" link shown on every admin section page. Lives outside
// the page bodies so each route gets it consistently (wired via the /admin
// layout and added manually to routes that sit outside the /admin segment).
export function BackToAdmin() {
  return (
    <Link
      href="/admin"
      className="inline-flex w-fit items-center gap-1 rounded-medium border-2 border-default-200 px-3 py-1.5 text-sm font-medium text-default-600 transition-colors hover:border-default-400 hover:text-default-900"
    >
      <span aria-hidden>←</span>
      Back to admin
    </Link>
  );
}

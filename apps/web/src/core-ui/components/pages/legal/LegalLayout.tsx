'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { FiArrowLeft } from 'react-icons/fi';

interface LegalLayoutProps {
  title: string;
  /** ISO date (YYYY-MM-DD) of the last revision shown to the user. */
  lastUpdated: string;
  /** Optional back href (defaults to settings). */
  backHref?: string;
  children: ReactNode;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export function LegalLayout({ title, lastUpdated, backHref = '/profile/settings', children }: LegalLayoutProps) {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 sm:py-8 flex flex-col gap-6 pb-16">
        {/* Header */}
        <header className="relative flex items-center justify-center min-h-10 border-b border-black/10 pb-3">
          <Link
            href={backHref}
            aria-label="Back"
            className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition"
          >
            <FiArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-base sm:text-lg font-bold text-gray-500 tracking-wide uppercase">{title}</h1>
        </header>

        {/* Last updated meta */}
        <div className="flex items-center justify-between rounded-2xl bg-white border border-black border-b-2 px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Last updated</span>
          <span className="text-sm font-bold text-black tabular-nums">{formatDate(lastUpdated)}</span>
        </div>

        {/* Body */}
        <article className="rounded-2xl bg-white border border-black border-b-2 p-5 sm:p-6 prose prose-sm max-w-none text-black [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2:first-child]:mt-0 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-gray-700 [&_ul]:text-sm [&_ul]:text-gray-700 [&_li]:my-1 [&_a]:text-primary [&_a]:font-bold">
          {children}
        </article>
      </div>
    </div>
  );
}

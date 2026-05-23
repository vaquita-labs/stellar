'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { FiArrowLeft } from 'react-icons/fi';

interface MockedSubPageLayoutProps {
  title: string;
  /** Short tagline shown under the title. */
  subtitle?: string;
  /** Where the back arrow returns to. */
  backHref?: string;
  /** Hide the "Soon" badge if the page becomes real later. */
  showSoonBadge?: boolean;
  children: ReactNode;
}

/**
 * Shared chrome for the mocked Profile sub-pages (Preferences, Help, Feedback,
 * Contacts, Search). Keeps the SOON badge visible so users know the feature
 * isn't wired to the backend yet, while still letting them explore the UX.
 */
export function MockedSubPageLayout({
  title,
  subtitle,
  backHref = '/profile/settings',
  showSoonBadge = true,
  children,
}: MockedSubPageLayoutProps) {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-5 sm:pt-6 pb-6 flex flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Link
              href={backHref}
              aria-label="Back"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition"
            >
              <FiArrowLeft className="h-4 w-4" />
            </Link>
            {showSoonBadge && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-black border border-black border-b-2 rounded-full px-3 py-1">
                Soon
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-gray-600">{subtitle}</p>
            )}
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

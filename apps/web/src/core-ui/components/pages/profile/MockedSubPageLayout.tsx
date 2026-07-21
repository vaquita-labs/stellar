'use client';

import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowLeft } from 'react-icons/fi';

interface MockedSubPageLayoutProps {
  title: string;
  /** Short tagline shown under the title. */
  subtitle?: string;
  /** Fallback route when there's no in-app history to go back to. */
  backHref?: string;
  /** Hide the "Soon" badge if the page becomes real later. */
  showSoonBadge?: boolean;
  /**
   * Render the title inline next to the back button (small font) instead of as
   * the big block underneath. Frees vertical space on content-first pages.
   */
  inlineTitle?: boolean;
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
  inlineTitle = false,
  children,
}: MockedSubPageLayoutProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const handleBack = () => {
    // Prefer returning to wherever the user came from. Fall back to the
    // provided href when there's no in-app history (e.g. direct URL entry).
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(backHref);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* min-h-full so a child can claim the leftover space with flex-1 (e.g. an
          empty state that centers itself in the rest of the screen). */}
      <div className="mx-auto w-full min-h-full max-w-2xl px-4 sm:px-6 pt-5 sm:pt-6 pb-6 flex flex-col gap-6">
        <header className={inlineTitle ? 'flex flex-col gap-2' : 'flex flex-col gap-4'}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              aria-label={t('common.back')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition shrink-0"
            >
              <FiArrowLeft className="h-4 w-4" />
            </button>
            {inlineTitle && (
              <h1 className="flex-1 min-w-0 text-base font-extrabold text-black tracking-tight truncate text-center">
                {title}
              </h1>
            )}
            {showSoonBadge ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-black border border-black border-b-2 rounded-full px-3 py-1">
                {t('common.soon')}
              </span>
            ) : (
              // Mirror of the back button so the inline title stays optically centered.
              inlineTitle && <span aria-hidden className="h-9 w-9 shrink-0" />
            )}
          </div>
          {!inlineTitle ? (
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
            </div>
          ) : (
            subtitle && <p className="text-sm text-gray-600">{subtitle}</p>
          )}
        </header>

        {children}
      </div>
    </div>
  );
}

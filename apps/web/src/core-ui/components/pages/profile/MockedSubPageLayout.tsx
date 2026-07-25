'use client';

import { PageHeader } from '@/core-ui/components/molecules/PageHeader';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface MockedSubPageLayoutProps {
  title: string;
  /** Short tagline shown under the title. */
  subtitle?: string;
  /** Fallback route when there's no in-app history to go back to. */
  backHref?: string;
  /** Cierra el panel apilado en vez de navegar por ruta. Lo pasa el modal padre
   *  cuando la página se abre como panel; sin él, el back navega (ruta suelta). */
  onBack?: () => void;
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
  onBack,
  showSoonBadge = true,
  children,
}: MockedSubPageLayoutProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const handleBack =
    onBack ??
    (() => {
      // Prefer returning to wherever the user came from. Fall back to the
      // provided href when there's no in-app history (e.g. direct URL entry).
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
      } else {
        router.push(backHref);
      }
    });

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* min-h-full so a child can claim the leftover space with flex-1 (e.g. an
          empty state that centers itself in the rest of the screen). */}
      <div className="mx-auto w-full min-h-full max-w-2xl px-4 sm:px-6 pt-5 sm:pt-6 pb-6 flex flex-col gap-5">
        {/* Misma barra que el resto de la app (PageHeader): back de 32px a la
            izquierda y título compacto centrado. El badge SOON viaja en el
            slot derecho para no romper ese centrado. */}
        <header className="flex flex-col gap-2">
          <PageHeader
            title={title}
            onBack={handleBack}
            rightSlot={
              showSoonBadge ? (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-black border border-black border-b-2 rounded-full px-2.5 py-0.5">
                  {t('common.soon')}
                </span>
              ) : undefined
            }
          />
          {subtitle && <p className="text-sm text-gray-600 text-center">{subtitle}</p>}
        </header>

        {children}
      </div>
    </div>
  );
}

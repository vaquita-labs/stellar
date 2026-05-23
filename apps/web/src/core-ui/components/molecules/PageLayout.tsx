'use client';

import { ReactNode } from 'react';
import { PageHeader } from './PageHeader';

type RightAction = {
  iconSrc: string;
  ariaLabel: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
};

interface PageLayoutProps {
  title: string;
  backHref?: string;
  onBack?: () => void;
  rightAction?: RightAction;
  rightSlot?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  /** Gap class between the header and the content (e.g. "gap-3"). Defaults to "gap-6". */
  headerGap?: string;
}

export function PageLayout({
  title,
  backHref,
  onBack,
  rightAction,
  rightSlot,
  children,
  contentClassName = '',
  headerGap = 'gap-2',
}: PageLayoutProps) {
  return (
    <div className="h-full overflow-y-auto">
      {/* Extra bottom padding on mobile so the last item clears the fixed
          bottom nav (h-16). Desktop has a sidebar instead, so pb-12 is fine. */}
      <div className={`mx-auto w-full max-w-2xl px-4 py-6 sm:py-8 flex flex-col ${headerGap} pb-24 md:pb-12`}>
        <PageHeader
          title={title}
          backHref={backHref}
          onBack={onBack}
          rightAction={rightAction}
          rightSlot={rightSlot}
        />
        <div className={`flex flex-col gap-6 ${contentClassName}`}>{children}</div>
      </div>
    </div>
  );
}

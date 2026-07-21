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
  /** Gap class between the content blocks. Defaults to "gap-6". */
  contentGap?: string;
  /** Overrides the header title size (e.g. "text-lg" for long titles). */
  titleClassName?: string;
  /** Pins the header to the top while the content scrolls under it. Opt-in:
   *  only worth it on endless feeds, where the title would otherwise be gone
   *  forever after the first swipe. */
  stickyHeader?: boolean;
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
  contentGap = 'gap-6',
  titleClassName,
  stickyHeader = false,
}: PageLayoutProps) {
  return (
    <div className="h-full overflow-y-auto">
      {/* Aire al final para que el último ítem no quede pegado al borde. Antes
          era pb-24 para dejar pasar una barra de navegación fija que ya no
          existe, y dejaba un hueco enorme al final de cada página. */}
      <div className={`mx-auto w-full max-w-2xl px-4 py-6 sm:py-8 flex flex-col ${headerGap} pb-10`}>
        {/* Wrapped rather than styled through PageHeader's className: the sticky
            bar needs its own horizontal padding, which would collide with the
            header's own px-11 (same specificity, order decides the winner).
            Every margin here is cancelled by an equal padding, so the header
            lands in exactly the same spot as in the non-sticky layout and never
            shifts on scroll — the paddings only exist to stretch the opaque
            background over the page gutter (sides), the space above the title
            and the gap below it, so cards pass under a solid bar instead of
            being sliced against the text. */}
        <div
          className={
            stickyHeader
              ? 'sticky top-0 z-20 -mx-4 px-4 -mt-6 pt-6 sm:-mt-8 sm:pt-8 -mb-2 pb-2 bg-background'
              : 'contents'
          }
        >
          <PageHeader
            title={title}
            backHref={backHref}
            onBack={onBack}
            rightAction={rightAction}
            rightSlot={rightSlot}
            titleClassName={titleClassName}
          />
        </div>
        <div className={`flex flex-col ${contentGap} ${contentClassName}`}>{children}</div>
      </div>
    </div>
  );
}

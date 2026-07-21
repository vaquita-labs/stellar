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
}: PageLayoutProps) {
  return (
    <div className="h-full overflow-y-auto">
      {/* Aire al final para que el último ítem no quede pegado al borde. Antes
          era pb-24 para dejar pasar una barra de navegación fija que ya no
          existe, y dejaba un hueco enorme al final de cada página. */}
      <div className={`mx-auto w-full max-w-2xl px-4 py-6 sm:py-8 flex flex-col ${headerGap} pb-10`}>
        <PageHeader
          title={title}
          backHref={backHref}
          onBack={onBack}
          rightAction={rightAction}
          rightSlot={rightSlot}
          titleClassName={titleClassName}
        />
        <div className={`flex flex-col ${contentGap} ${contentClassName}`}>{children}</div>
      </div>
    </div>
  );
}

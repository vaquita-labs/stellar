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
}

export function PageLayout({
  title,
  backHref,
  onBack,
  rightAction,
  rightSlot,
  children,
  contentClassName = '',
}: PageLayoutProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8 flex flex-col gap-6 pb-12">
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

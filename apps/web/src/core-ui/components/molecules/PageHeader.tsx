'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const ICON_SIZE = 28;

type RightAction = {
  iconSrc: string;
  ariaLabel: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
};

interface PageHeaderProps {
  title: string;
  backHref?: string;
  onBack?: () => void;
  rightAction?: RightAction;
  rightSlot?: ReactNode;
  className?: string;
}

const BackContent = () => {
  const { t } = useTranslation();
  return (
    <Image
      src="/icons/arrow-back.svg"
      alt={t('common.back')}
      width={ICON_SIZE}
      height={ICON_SIZE}
      className="object-contain"
      priority
    />
  );
};

export function PageHeader({
  title,
  backHref,
  onBack,
  rightAction,
  rightSlot,
  className = '',
}: PageHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className={`relative flex items-center justify-center min-h-12 px-14 ${className}`}>
      <div className="absolute left-0 flex items-center">
        {backHref ? (
          <Link href={backHref} aria-label={t('common.back')} className="flex items-center justify-center">
            <BackContent />
          </Link>
        ) : onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="flex items-center justify-center bg-transparent"
          >
            <BackContent />
          </button>
        ) : null}
      </div>

      <h1 className="text-xl sm:text-2xl font-bold text-black truncate text-center">
        {title}
      </h1>

      {(rightAction || rightSlot) && (
        <div className="absolute right-0 flex items-center">
          {rightAction ? <RightActionButton {...rightAction} /> : rightSlot}
        </div>
      )}
    </div>
  );
}

function RightActionButton({ iconSrc, ariaLabel, onClick, href, disabled }: RightAction) {
  const content = (
    <Image
      src={iconSrc}
      alt={ariaLabel}
      width={ICON_SIZE}
      height={ICON_SIZE}
      className={`object-contain ${disabled ? 'grayscale opacity-60' : ''}`}
      priority
    />
  );

  if (href && !disabled) {
    return (
      <Link href={href} aria-label={ariaLabel} className="flex items-center justify-center">
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`flex items-center justify-center bg-transparent ${
        disabled ? 'cursor-not-allowed' : ''
      }`}
    >
      {content}
    </button>
  );
}

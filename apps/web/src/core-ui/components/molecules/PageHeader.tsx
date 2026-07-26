'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ReactNode } from 'react';
import { FiChevronLeft, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { CircleIconButton } from './CircleIconButton';

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
  /**
   * Ícono del botón de la izquierda. `back` (por defecto) es la flecha de
   * navegación; `close` es una X, para cuando la pantalla se muestra apilada
   * como panel/modal y ese botón en realidad cierra en vez de retroceder.
   */
  leftIcon?: 'back' | 'close';
  rightAction?: RightAction;
  rightSlot?: ReactNode;
  className?: string;
  /** Overrides the title size classes (e.g. "text-lg" for long titles). */
  titleClassName?: string;
}

/**
 * Header estándar de la app: back circular de 32px a la izquierda y título
 * compacto centrado. Todas las páginas (y el header de los modales, vía
 * AppModal) comparten esta escala; no dupliques la barra a mano.
 */
export function PageHeader({
  title,
  backHref,
  onBack,
  leftIcon = 'back',
  rightAction,
  rightSlot,
  className = '',
  titleClassName = 'text-base sm:text-lg',
}: PageHeaderProps) {
  const { t } = useTranslation();
  const isClose = leftIcon === 'close';
  const leftAriaLabel = isClose ? t('common.close') : t('common.back');
  const LeftIcon = isClose ? FiX : FiChevronLeft;
  // La flecha de navegación vive a la izquierda; la X de cerrar (panel apilado)
  // se ancla a la derecha y en blanco, como el resto de los modales.
  const navButton = backHref ? (
    <CircleIconButton
      href={backHref}
      variant={isClose ? 'white' : 'primary'}
      ariaLabel={leftAriaLabel}
      icon={<LeftIcon className="w-4 h-4" />}
    />
  ) : onBack ? (
    <CircleIconButton
      variant={isClose ? 'white' : 'primary'}
      ariaLabel={leftAriaLabel}
      onClick={onBack}
      icon={<LeftIcon className="w-4 h-4" />}
    />
  ) : null;
  return (
    // mb-1: un respiro mínimo (4px) que separa la barra del contenido, para que
    // se lea como header y no como la primera fila del body.
    <div className={`relative flex items-center justify-center min-h-8 px-11 mb-1 ${className}`}>
      {!isClose && <div className="absolute left-0 flex items-center">{navButton}</div>}

      <h1 className={`${titleClassName} font-bold text-black truncate text-center`}>
        {title}
      </h1>

      {(isClose || rightAction || rightSlot) && (
        <div className="absolute right-0 flex items-center">
          {isClose ? navButton : rightAction ? <RightActionButton {...rightAction} /> : rightSlot}
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

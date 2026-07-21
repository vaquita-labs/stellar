'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

export type CircleIconButtonVariant = 'primary' | 'white';
/** `md` (36px) para el back de páginas; `sm` (28px) para los headers de modal. */
export type CircleIconButtonSize = 'sm' | 'md';

interface CircleIconButtonProps {
  /** Ícono a renderizar (ej. <FiChevronLeft className="w-5 h-5" />). */
  icon: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
  /** Si se define, se renderiza como <Link> en vez de <button>. */
  href?: string;
  variant?: CircleIconButtonVariant;
  size?: CircleIconButtonSize;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}

/**
 * Botón circular estándar para los headers de la app: back (primary) y close
 * (white) de los modales y el back de las páginas. Misma forma, tamaño y borde
 * inferior en todos lados; solo cambia el color de fondo por variante. Se
 * definió acá para que back/close/nav se mantengan idénticos en un solo lugar.
 */
const VARIANT_CLASSES: Record<CircleIconButtonVariant, string> = {
  primary: 'bg-primary hover:bg-primary/80',
  white: 'bg-white hover:bg-default-100',
};

const SIZE_CLASSES: Record<CircleIconButtonSize, string> = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-full border border-black border-b-2 ' +
  'text-black shrink-0 transition-all active:translate-y-0.5 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0';

export function CircleIconButton({
  icon,
  ariaLabel,
  onClick,
  href,
  variant = 'white',
  size = 'md',
  disabled = false,
  className = '',
  type = 'button',
}: CircleIconButtonProps) {
  const classes = `${BASE_CLASSES} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`;

  if (href && !disabled) {
    return (
      <Link href={href} aria-label={ariaLabel} className={classes}>
        {icon}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} aria-label={ariaLabel} disabled={disabled} className={classes}>
      {icon}
    </button>
  );
}

'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { FOCUS_RING_CLASSES } from './PressableButton';

interface MapIconButtonProps {
  /** Ícono ilustrado del acceso (un <Image> de ~28px). */
  icon: ReactNode;
  /** Texto bajo el botón. Es parte del botón, no un adorno: sin él el ícono solo no dice que se toca. */
  label: string;
  ariaLabel: string;
  /** Si se define, se renderiza como <Link> en vez de <button>. */
  href?: string;
  onClick?: () => void;
  /** Contador o marca en la esquina superior derecha. */
  badge?: ReactNode;
  /** Halo ámbar: hay algo esperando al usuario detrás de este acceso. */
  highlighted?: boolean;
}

/**
 * Acceso rápido que flota sobre el mapa. Es el primo redondo de
 * [PressableButton] para el HUD: mismo borde negro con la base más gruesa y el
 * mismo hundido al presionar, pero con fondo propio y sombra para despegarse
 * del escenario isométrico.
 *
 * Antes estos accesos eran un <Image> suelto con un drop-shadow: sin borde, sin
 * fondo y sin etiqueta se leían como calcomanías del mapa y no como controles.
 * El círculo da el marco, la etiqueta dice qué hace y el área de 44px cumple el
 * mínimo táctil (el ícono de 28px por sí solo se quedaba corto).
 */
export function MapIconButton({ icon, label, ariaLabel, href, onClick, badge, highlighted = false }: MapIconButtonProps) {
  const buttonClasses = [
    'relative flex h-11 w-11 items-center justify-center rounded-full',
    'border border-black border-b-3 bg-background text-black',
    'shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition hover:bg-white',
    'active:border-b-[1px] active:translate-y-[2px]',
    FOCUS_RING_CLASSES,
  ].join(' ');

  const content = (
    <>
      <span className="relative flex items-center justify-center">{icon}</span>
      {badge}
    </>
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {highlighted && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -m-1.5 animate-pulse rounded-full bg-amber-300/60 blur-md motion-reduce:animate-none"
          />
        )}
        {href ? (
          <Link href={href} aria-label={ariaLabel} className={buttonClasses}>
            {content}
          </Link>
        ) : (
          <button type="button" onClick={onClick} aria-label={ariaLabel} className={buttonClasses}>
            {content}
          </button>
        )}
      </div>
      {/* La etiqueta va en pastilla oscura porque el fondo es el mapa: sobre el
          cielo claro o sobre el pasto tiene que leerse igual. `aria-hidden`
          porque el nombre accesible ya lo da el `aria-label` del botón. */}
      <span aria-hidden className="rounded-full bg-black/60 px-1.5 py-[1px] text-[9px] font-bold leading-[13px] text-white">
        {label}
      </span>
    </div>
  );
}

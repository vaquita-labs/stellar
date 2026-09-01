'use client';

import Link from 'next/link';
import { ReactNode, TouchEventHandler, WheelEventHandler } from 'react';

export type PressableButtonVariant = 'success' | 'primary' | 'white' | 'cream' | 'ghost' | 'danger' | 'info';
/**
 * `cta` — botón de acción principal (footer de modal, panel de home).
 * `md`  — botón estándar/secundario dentro de una pantalla.
 * `row` — fila de opción de una lista o modal (contenido alineado a la izquierda).
 * `chip` — pastilla chica (filtros, acciones inline).
 */
export type PressableButtonSize = 'cta' | 'md' | 'row' | 'chip';

export interface PressableButtonProps {
  children: ReactNode;
  onClick?: () => void;
  /** Si se define, se renderiza como <Link> en vez de <button>. */
  href?: string;
  variant?: PressableButtonVariant;
  size?: PressableButtonSize;
  disabled?: boolean;
  /** Ocupa todo el ancho. `cta` y `row` ya lo hacen por defecto. */
  fullWidth?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  ariaLabel?: string;
  /** Se pasa tal cual al elemento, para los anclajes del tutorial. */
  dataTutorial?: string;
  /**
   * Gestos extra para las filas que además de tocarse se deslizan (ej. el
   * selector de wallet del retiro, que cicla con swipe vertical o rueda).
   */
  onTouchStart?: TouchEventHandler<HTMLElement>;
  onTouchEnd?: TouchEventHandler<HTMLElement>;
  onWheel?: WheelEventHandler<HTMLElement>;
}

/**
 * Botón "grueso" de la app: borde negro con el borde inferior más marcado, que
 * al presionar se hunde (el borde de abajo se achica y el botón baja lo mismo,
 * así la altura total no cambia y no salta el layout).
 *
 * Es el hermano rectangular de [CircleIconButton]: misma idea, mismas variantes
 * de color, mismo gesto. Antes de esto el estilo estaba copiado a mano en más de
 * cien lugares —solo el string del CTA verde aparecía idéntico en nueve
 * archivos— y el efecto de presionado existía en apenas ocho.
 *
 * A propósito NO hay `hover:-translate-y-*`: levantar en hover no se ve en
 * mobile, que es donde vive la app, y convive mal con el gesto de hundir.
 */
const VARIANT_CLASSES: Record<PressableButtonVariant, string> = {
  success: 'bg-success border-[#018222] text-black hover:bg-success/90',
  primary: 'bg-primary border-black text-black hover:bg-primary/80',
  white: 'bg-white border-black text-black hover:bg-[#F5FBFF]',
  cream: 'bg-background border-black text-black hover:bg-[#FBEBCF]',
  ghost: 'bg-transparent border-black text-black hover:bg-black/5',
  danger: 'bg-error border-[#B3261E] text-white hover:bg-error/90',
  info: 'bg-[#DDF4FF] border-black text-black hover:bg-[#C4ECFF]',
};

/**
 * Cada tamaño define su grosor de borde inferior y cuánto se hunde: el
 * desplazamiento es exactamente la diferencia de grosor, para que el botón no
 * cambie de alto al presionarse.
 */
const SIZE_CLASSES: Record<PressableButtonSize, string> = {
  cta: 'w-full justify-center rounded-md px-4 py-5 text-base font-bold border-b-5 active:border-b-2 active:translate-y-[3px]',
  md: 'justify-center rounded-md px-4 py-2.5 text-sm font-bold border-b-3 active:border-b-[1px] active:translate-y-[2px]',
  row: 'w-full justify-start text-left rounded-lg px-4 py-3 gap-3 border-b-2 active:border-b-[1px] active:translate-y-[1px]',
  chip: 'justify-center rounded-md px-2.5 py-1 text-xs font-bold border-b-2 active:border-b-[1px] active:translate-y-[1px]',
};

/**
 * El anillo de foco es parte del contrato del botón, no un extra: sin él, quien
 * navega con teclado (y todo el escritorio) no tiene NINGUNA señal de qué está
 * seleccionado, porque el único feedback del componente es el hundido, que solo
 * existe mientras se mantiene apretado. Se usa `outline` y no `ring` a propósito:
 * `outline` no lo recorta el `overflow` de los contenedores ni compite con el
 * borde inferior grueso, que sí es un `border`.
 */
export const FOCUS_RING_CLASSES = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black';

const BASE_CLASSES =
  'inline-flex items-center gap-2 border transition ' +
  FOCUS_RING_CLASSES +
  ' disabled:opacity-50 disabled:pointer-events-none disabled:active:translate-y-0';

export function PressableButton({
  children,
  onClick,
  href,
  variant = 'white',
  size = 'md',
  disabled = false,
  fullWidth = false,
  className = '',
  type = 'button',
  ariaLabel,
  dataTutorial,
  onTouchStart,
  onTouchEnd,
  onWheel,
}: PressableButtonProps) {
  const classes = [BASE_CLASSES, SIZE_CLASSES[size], VARIANT_CLASSES[variant], fullWidth ? 'w-full' : '', className]
    .filter(Boolean)
    .join(' ');

  if (href && !disabled) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={classes}
        data-tutorial={dataTutorial}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      className={classes}
      data-tutorial={dataTutorial}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
    >
      {children}
    </button>
  );
}

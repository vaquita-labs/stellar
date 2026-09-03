'use client';

import { motion, useAnimationControls } from 'framer-motion';

type AmountControls = ReturnType<typeof useAnimationControls>;

interface AmountDisplayProps {
  /** Monto crudo tal como lo tecleó el usuario ('' = vacío, '1.' a medio escribir). */
  value: string;
  /** Símbolo de la moneda. '$' para USD, 'Bs' para bolivianos. */
  symbol?: string;
  /** Dónde va el símbolo: '$100' vs '100 Bs'. */
  symbolPosition?: 'prefix' | 'suffix';
  /** Gris en vez de negro: vacío, o un monto que no se puede usar. */
  muted?: boolean;
  /** Controles de framer-motion para el shake cuando el monto no entra. */
  controls?: AmountControls;
  size?: 'md' | 'lg';
  className?: string;
}

const SIZES = { md: 'text-3xl', lg: 'text-4xl' } as const;

/**
 * El número grande de las pantallas de monto.
 *
 * Muestra lo tecleado TAL CUAL, sin normalizar: '1.' se ve como '1.' y no como
 * '1.00'. Es a propósito — el usuario está a mitad de escribir el decimal, y
 * completárselo le mueve el número bajo el dedo. El vacío sí se muestra como
 * cero, que es lo que hay.
 *
 * El símbolo es una prop y no un '$' fijo porque la compra con moneda local se
 * teclea en bolivianos, que además van DESPUÉS del número.
 */
export function AmountDisplay({
  value,
  symbol = '$',
  symbolPosition = 'prefix',
  muted = false,
  controls,
  size = 'md',
  className = '',
}: AmountDisplayProps) {
  const shown = value === '' ? '0.00' : value;
  // Sin símbolo se muestra el número pelado: el corredor todavía puede no haber
  // resuelto cuál es su moneda, y un espacio colgando se ve como un error.
  const text = !symbol ? shown : symbolPosition === 'prefix' ? `${symbol}${shown}` : `${shown} ${symbol}`;

  return (
    <motion.p
      animate={controls}
      className={`${SIZES[size]} font-bold ${muted ? 'text-gray-400' : 'text-black'} ${className}`}
    >
      {text}
    </motion.p>
  );
}

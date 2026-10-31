'use client';

import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { ReactNode, useEffect } from 'react';
import { FiCheck } from 'react-icons/fi';

/** Confetti pieces, laid out on a fixed fan so the burst is the same every time. */
const PIECES = 16;
const COLORS = ['#F5A161', '#9ED36A', '#F0B429', '#7CC4FA', '#F38BB0', '#262626'];
const CONFETTI = Array.from({ length: PIECES }, (_, i) => {
  const angle = (i / PIECES) * Math.PI * 2 + (i % 2) * 0.2;
  const radius = 90 + (i % 3) * 28;
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius) - 20,
    rotate: 180 + (i % 4) * 90,
    color: COLORS[i % COLORS.length]!,
    delay: 0.2 + (i % 5) * 0.04,
    round: i % 3 === 0,
  };
});

/**
 * The app's "it worked" screen: the green check springs in, a burst of
 * confetti in the app's palette flies out, and the amount counts up to its
 * value. One component for every success (a deposit that landed, a withdrawal
 * sent), so they all celebrate the same way. Whatever comes after (a caption,
 * the Close button) goes in `children`.
 */
export function SuccessCelebration({
  title,
  amount,
  caption,
  children,
  className = '',
}: {
  title: ReactNode;
  /** The figure to count up to, already formatted by `format`. */
  amount?: { value: number; format: (value: number) => string } | null;
  caption?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const value = amount?.value ?? 0;
  const format = amount?.format;
  const counter = useMotionValue(0);
  const shown = useTransform(counter, (v) => (format ? format(v) : ''));
  useEffect(() => {
    const controls = animate(counter, value, { duration: 1.1, delay: 0.35, ease: 'easeOut' });
    return () => controls.stop();
  }, [counter, value]);

  return (
    <div className={`flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center ${className}`}>
      <div className="relative flex items-center justify-center">
        {CONFETTI.map((piece, i) => (
          <motion.span
            key={i}
            aria-hidden
            initial={{ x: 0, y: 0, opacity: 0, scale: 0, rotate: 0 }}
            animate={{ x: piece.x, y: piece.y, opacity: [0, 1, 1, 0], scale: [0, 1, 1, 0.5], rotate: piece.rotate }}
            transition={{ duration: 1.3, delay: piece.delay, ease: 'easeOut' }}
            className={'pointer-events-none absolute h-2.5 w-2.5 ' + (piece.round ? 'rounded-full' : 'rounded-sm')}
            style={{ backgroundColor: piece.color }}
          />
        ))}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="flex h-24 w-24 items-center justify-center rounded-full border border-black border-b-4 bg-success"
        >
          <FiCheck className="h-12 w-12 text-black" strokeWidth={3} />
        </motion.div>
      </div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="text-xl font-bold text-black"
      >
        {title}
      </motion.p>
      {amount && <motion.p className="text-4xl font-bold text-black tabular-nums">{shown}</motion.p>}
      {caption && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-sm text-gray-500"
        >
          {caption}
        </motion.p>
      )}
      {children && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-4 flex w-full flex-col gap-2"
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}

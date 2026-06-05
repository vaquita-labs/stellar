'use client';

import type { PropsWithChildren, ReactNode } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'white' | 'danger' | 'ghost';

// Variant palettes copied verbatim from the web app's design system so admin and
// web render identical buttons. `ghost` is the only addition (admin needs a
// low-emphasis action style).
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary hover:bg-primary/80 text-black border-black',
  secondary: 'bg-black hover:bg-slate-800 text-white border-black',
  white: 'bg-white hover:bg-white/80 text-black border-black',
  ghost: 'bg-transparent hover:bg-black/5 text-black border-black/15',
  danger:
    'bg-red-50 hover:bg-red-100 text-red-600 border-red-200/70 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-300 dark:border-red-500/30',
};

export type ButtonProps = PropsWithChildren<{
  // Loosely typed so handlers written for HeroUI's `onPress` (PressEvent) and
  // plain `() => void` callbacks both assign cleanly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPress?: (...args: any[]) => void;
  /** Visual style. `type` is kept as a backwards-compatible alias for `variant`. */
  variant?: ButtonVariant;
  type?: ButtonVariant;
  size?: 'sm' | 'md';
  /** Native button behaviour. Defaults to "button" so it never submits a form by accident. */
  htmlType?: 'button' | 'submit' | 'reset';
  className?: string;
  endContent?: ReactNode;
  startContent?: ReactNode;
  isLoading?: boolean;
  isDisabled?: boolean;
  'aria-label'?: string;
  /** Stretch to the full width of the container (`wFull` kept for web parity). */
  wFull?: boolean;
  fullWidth?: boolean;
}>;

export const Button = (props: ButtonProps) => {
  const {
    onPress,
    children,
    className = '',
    startContent,
    endContent,
    isLoading,
    isDisabled,
    variant,
    type,
    size = 'md',
    htmlType = 'button',
    wFull,
    fullWidth,
    'aria-label': ariaLabel,
  } = props;

  const styleVariant = variant ?? type ?? 'primary';
  const sizeClasses = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-5 py-2 text-sm';
  const widthClass = wFull || fullWidth ? ' w-full' : '';
  const disabled = isDisabled || isLoading;

  return (
    <button
      type={htmlType}
      onClick={onPress ? () => onPress() : undefined}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 rounded-md border border-b-3 font-semibold transition shadow-sm hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${sizeClasses} ${VARIANTS[styleVariant]}${widthClass} ${className}`}
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          {startContent}
          {children}
          {endContent}
        </>
      )}
    </button>
  );
};
'use client';

export type SpinnerProps = {
  /** Tailwind size classes for the spinner (default: h-4 w-4). */
  className?: string;
};

/**
 * Minimal CSS spinner that inherits the current text colour, so it works on any
 * button variant without extra wiring. Kept dependency-free on purpose.
 */
export const Spinner = ({ className = 'h-4 w-4' }: SpinnerProps) => (
  <span
    aria-hidden
    className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
  />
);
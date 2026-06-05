'use client';

import type { HTMLAttributes } from 'react';

// White surface, black border with a thicker bottom edge and a rounded-xl
// corner — the web app's card look.
const CARD_BASE = 'rounded-xl border border-black border-b-2 bg-white';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds hover lift + pointer affordance for clickable cards. */
  interactive?: boolean;
};

export const Card = ({ className = '', interactive = false, ...rest }: CardProps) => (
  <div
    className={`${CARD_BASE} ${
      interactive ? 'cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0' : ''
    } ${className}`}
    {...rest}
  />
);

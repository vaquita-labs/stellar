'use client';

import { ReactNode } from 'react';
import type { IconType } from 'react-icons';

/**
 * A sheet's centered message: what is going on and, underneath, what to do
 * about it. One figure (an icon in the app's circle, an emoji, a spinner), a
 * bold title, a short body, then whatever the screen adds (buttons, amounts, a
 * list of steps). Every modal state that is a message rather than a form goes
 * through this, so they all read the same.
 */
export function ModalMessage({
  icon: Icon,
  figure,
  title,
  body,
  children,
  className = '',
}: {
  /** Drawn inside the app's white circle. */
  icon?: IconType;
  /** Any other figure, drawn as is (an emoji, a spinner). Ignored when `icon` is set. */
  figure?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 py-6 text-center ${className}`}>
      {Icon ? (
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-black border-b-2 bg-white">
          <Icon className="h-6 w-6 text-black" />
        </span>
      ) : (
        figure
      )}
      <p className="text-base font-bold text-black">{title}</p>
      {body && <p className="text-sm text-gray-600">{body}</p>}
      {children}
    </div>
  );
}

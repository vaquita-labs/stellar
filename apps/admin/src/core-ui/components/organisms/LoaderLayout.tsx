'use client';

import { ReactNode } from 'react';

export const LoaderLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby="login-title"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" />
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5
                   animate-in fade-in zoom-in-95 duration-150"
      >
        {children}
      </div>
    </div>
  );
};

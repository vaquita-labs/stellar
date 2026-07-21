'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: ReactNode;
  /** Classes for the wrapping <label>. */
  containerClassName?: string;
};

export const Checkbox = ({ label, className = '', containerClassName = '', ...rest }: CheckboxProps) => (
  <label className={`flex items-center gap-2 text-sm text-black ${containerClassName}`}>
    <input
      type="checkbox"
      className={`h-4 w-4 cursor-pointer rounded border-black accent-primary ${className}`}
      {...rest}
    />
    {label}
  </label>
);

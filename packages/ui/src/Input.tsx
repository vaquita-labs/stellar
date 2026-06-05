'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { FIELD_BASE, FIELD_ERROR, FIELD_LABEL } from './styles';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  /** Classes for the wrapping <label> (e.g. width/flex). */
  containerClassName?: string;
};

export const Input = ({ label, error, hint, className = '', containerClassName = '', ...rest }: InputProps) => {
  const control = <input className={`${FIELD_BASE} ${error ? FIELD_ERROR : ''} ${className}`} {...rest} />;

  // Bare control when there's nothing to wrap, so it drops into inline rows cleanly.
  if (!label && !error && !hint) return control;

  return (
    <label className={`${FIELD_LABEL} ${containerClassName}`}>
      {label}
      {control}
      {hint && <span className="text-xs text-default-400">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
};

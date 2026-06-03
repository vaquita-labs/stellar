'use client';

import type { ReactNode, SelectHTMLAttributes } from 'react';
import { FIELD_BASE, FIELD_ERROR, FIELD_LABEL } from './styles';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  error?: string | null;
  containerClassName?: string;
};

export const Select = ({ label, error, className = '', containerClassName = '', children, ...rest }: SelectProps) => {
  const control = (
    <select className={`${FIELD_BASE} cursor-pointer ${error ? FIELD_ERROR : ''} ${className}`} {...rest}>
      {children}
    </select>
  );

  if (!label && !error) return control;

  return (
    <label className={`${FIELD_LABEL} ${containerClassName}`}>
      {label}
      {control}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
};

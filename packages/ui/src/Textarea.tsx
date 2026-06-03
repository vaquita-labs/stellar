'use client';

import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { FIELD_BASE, FIELD_ERROR, FIELD_LABEL } from './styles';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  containerClassName?: string;
};

export const Textarea = ({ label, error, hint, className = '', containerClassName = '', ...rest }: TextareaProps) => {
  const control = <textarea className={`${FIELD_BASE} ${error ? FIELD_ERROR : ''} ${className}`} {...rest} />;

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

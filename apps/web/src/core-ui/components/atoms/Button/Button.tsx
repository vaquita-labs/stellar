'use client';

import { Button as HeroButton, Spinner } from '@heroui/react';
import { ButtonProps } from './types';

const BUTTON_TYPES = {
  primary: 'bg-primary hover:bg-primary/80 text-black border-black',
  secondary: 'bg-black hover:bg-slate-800 text-white border-black',
  white: 'bg-white hover:bg-white/80 text-black border-black',
  danger:
    'bg-red-50 hover:bg-red-100 text-red-600 border-red-200/70  dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-300 dark:border-red-500/30',
};

export const Button = (props: ButtonProps) => {
  const {
    onPress,
    children,
    className,
    startContent,
    endContent,
    isLoading,
    isDisabled,
    type = 'primary',
    wFull,
  } = props;

  return (
    <HeroButton
      onPress={onPress}
      className={`px-5 rounded-md ${(BUTTON_TYPES[type] || '') + (wFull ? ' w-full' : '')} border border-b-3 text-sm font-semibold transition shadow-sm hover:-translate-y-0.5 ${className}`}
      isDisabled={isDisabled || isLoading}
    >
      {isLoading ? (
        <Spinner size="sm" color="current" />
      ) : (
        <>
          {startContent}
          {children}
          {endContent}
        </>
      )}
    </HeroButton>
  );
};

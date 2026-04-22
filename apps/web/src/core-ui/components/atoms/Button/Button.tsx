'use client';

import { Button as HeroButton } from '@heroui/react';
import { PressEvents } from '@react-types/shared/src/events';
import { PropsWithChildren } from 'react';

export const Button = ({
  onPress,
  children,
  secondary,
  className,
}: PropsWithChildren<{ onPress: PressEvents['onPress']; secondary?: boolean; className?: string }>) => {
  return (
    <HeroButton
      onPress={onPress}
      className={`px-5 m-2 rounded-md w-full ${secondary ? 'bg-white hover:bg-white/80' : 'bg-primary hover:bg-primary/80'}  border border-black border-b-3 text-black text-sm font-semibold transition shadow-sm ${className}`}
    >
      {children}
    </HeroButton>
  );
};

import { PressEvents } from '@react-types/shared/src/events';
import { PropsWithChildren, ReactNode } from 'react';

export type ButtonProps = PropsWithChildren<{
  onPress?: PressEvents['onPress'];
  type?: 'primary' | 'secondary' | 'white' | 'danger';
  className?: string;
  endContent?: ReactNode;
  startContent?: ReactNode;
  isLoading?: boolean;
  isDisabled?: boolean;
  wFull?: boolean;
}>;

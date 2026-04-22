'use client';

import { ReactNode } from 'react';
import { useHasHydrated } from '../../hooks';
import { T } from '../atoms';
import { LoaderScreen } from './LoaderScreen';

export function WithHydrated({ children }: { children: ReactNode }) {
  const hydrated = useHasHydrated();

  if (hydrated) {
    return children;
  }

  return (
    <LoaderScreen withImage>
      <></>
    </LoaderScreen>
  );
}

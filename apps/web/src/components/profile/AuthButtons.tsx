'use client';

import { useNetworks } from '@/core-ui/hooks';
import StellarAuthButtons from './StellarAuthButtons';

export const AuthButtons = () => {
  const {
    data: { types },
  } = useNetworks();

  if (types.length === 0) {
    return null;
  }

  return (
    <div className="relative top-0 left-0 right-0 w-full">
      <div className="flex justify-end gap-1 w-full bg-primary z-10">
        {/* <PrivyAuthButtons /> */}
        <StellarAuthButtons />
      </div>
    </div>
  );
};

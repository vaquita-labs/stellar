'use client';

import { DummyAuthButtons, NetworkSelector } from '@/core-ui/components';
import { isDummyNetwork } from '@/networks/dummy';

export const AuthButtons = () => {
  return (
    <div className="absolute top-2 left-20 right-0">
      <div className="flex justify-end gap-2 p-2 w-full bg-transparent">
        <NetworkSelector />
        {isDummyNetwork() && <DummyAuthButtons />}
      </div>
    </div>
  );
};

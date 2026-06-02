'use client';

import StellarAuthButtons from './StellarAuthButtons';

export const AuthButtons = () => {
  return (
    <div className="relative top-0 left-0 right-0 w-full">
      <div className="flex justify-end gap-1 w-full bg-primary z-10">
        {/* <PrivyAuthButtons /> */}
        <StellarAuthButtons />
      </div>
    </div>
  );
};

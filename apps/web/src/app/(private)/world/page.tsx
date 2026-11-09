'use client';

import { HomePage } from '@/core-ui/components';
import { WorldLoader } from '@/core-ui/components/molecules/WorldLoader';
import { Suspense } from 'react';

// The World tab is the 3D world: map, the vaquita, streak/coins/stars and the
// shop — what /home was before it became the money dashboard. Same Suspense
// boundary as /home, for the same reason (see that page).
export default function Page() {
  return (
    <Suspense fallback={<WorldLoader />}>
      <HomePage variant="world" />
    </Suspense>
  );
}
